import { and, asc, desc, eq, gt, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS, MAX_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS, MIN_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS, } from "@paperclipai/shared";
import { agents, agentWakeupRequests, approvals, activityLog, companies, heartbeatRunEvents, heartbeatRunWatchdogDecisions, heartbeatRuns, issueComments, issueApprovals, issueRecoveryActions, issueRelations, issueThreadInteractions, issues, } from "@paperclipai/db";
import { parseObject, asBoolean, asNumber } from "../../adapters/utils.js";
import { runningProcesses } from "../../adapters/index.js";
import { forbidden, notFound } from "../../errors.js";
import { logger } from "../../middleware/logger.js";
import { isPidAlive, isProcessGroupAlive, terminateLocalService } from "../local-service-supervisor.js";
import { redactCurrentUserText } from "../../log-redaction.js";
import { redactSensitiveText } from "../../redaction.js";
import { logActivity } from "../activity-log.js";
import { budgetService } from "../budgets.js";
import { instanceSettingsService } from "../instance-settings.js";
import { issueRecoveryActionService } from "../issue-recovery-actions.js";
import { issueTreeControlService } from "../issue-tree-control.js";
import { issueService } from "../issues.js";
import { getRunLogStore } from "../run-log-store.js";
import { DEFAULT_MAX_SUCCESSFUL_RUN_HANDOFF_ATTEMPTS, FINISH_SUCCESSFUL_RUN_HANDOFF_REASON, SUCCESSFUL_RUN_MISSING_STATE_REASON, buildSuccessfulRunHandoffExhaustedNotice, noticeMetadataReferencesRecoveryAction, } from "./successful-run-handoff.js";
import { RECOVERY_ORIGIN_KINDS, buildIssueGraphLivenessLeafKey, isStrandedIssueRecoveryOriginKind, parseIssueGraphLivenessIncidentKey, } from "./origins.js";
import { classifyIssueGraphLiveness, } from "./issue-graph-liveness.js";
import { recoveryAssigneeAdapterOverrides, withRecoveryModelProfileHint, } from "./model-profile-hint.js";
import { isAutomaticRecoverySuppressedByPauseHold } from "./pause-hold-guard.js";
const EXECUTION_PATH_HEARTBEAT_RUN_STATUSES = ["queued", "running", "scheduled_retry"];
const UNSUCCESSFUL_HEARTBEAT_RUN_TERMINAL_STATUSES = ["failed", "cancelled", "timed_out"];
export const ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS = 60 * 60 * 1000;
export const ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS = 4 * 60 * 60 * 1000;
export const ACTIVE_RUN_OUTPUT_CONTINUE_REARM_MS = 30 * 60 * 1000;
const ACTIVE_RUN_OUTPUT_EVIDENCE_TAIL_BYTES = 8 * 1024;
const STRANDED_ISSUE_RECOVERY_ORIGIN_KIND = RECOVERY_ORIGIN_KINDS.strandedIssueRecovery;
const STALE_ACTIVE_RUN_EVALUATION_ORIGIN_KIND = RECOVERY_ORIGIN_KINDS.staleActiveRunEvaluation;
const DEFERRED_WAKE_CONTEXT_KEY = "_paperclipWakeContext";
const SESSIONED_LOCAL_ADAPTERS = new Set([
    "claude_local",
    "codex_local",
    "cursor",
    "gemini_local",
    "hermes_local",
    "opencode_local",
    "pi_local",
]);
function readNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}
function summarizeRunFailureForIssueComment(run) {
    if (!run)
        return null;
    if (readNonEmptyString(run.error) || readNonEmptyString(run.errorCode)) {
        return " Latest retry failure details were withheld from the issue thread; inspect the linked run for evidence.";
    }
    return null;
}
function didAutomaticRecoveryFail(latestRun, expectedRetryReason) {
    if (!latestRun)
        return false;
    const latestContext = parseObject(latestRun.contextSnapshot);
    const latestRetryReason = readNonEmptyString(latestContext.retryReason);
    return latestRetryReason === expectedRetryReason &&
        UNSUCCESSFUL_HEARTBEAT_RUN_TERMINAL_STATUSES.includes(latestRun.status);
}
function successfulRunHandoffRecoveryEvidence(latestRun) {
    if (!latestRun)
        return null;
    const context = parseObject(latestRun.contextSnapshot);
    const wakeReason = readNonEmptyString(context.wakeReason);
    const handoffReason = readNonEmptyString(context.handoffReason);
    const isSuccessfulRunHandoff = wakeReason === FINISH_SUCCESSFUL_RUN_HANDOFF_REASON ||
        handoffReason === SUCCESSFUL_RUN_MISSING_STATE_REASON ||
        asBoolean(context.handoffRequired, false) === true;
    if (!isSuccessfulRunHandoff)
        return null;
    const handoffAttempt = asNumber(context.handoffAttempt, 1);
    const maxHandoffAttempts = asNumber(context.maxHandoffAttempts, DEFAULT_MAX_SUCCESSFUL_RUN_HANDOFF_ATTEMPTS);
    return {
        sourceRunId: readNonEmptyString(context.sourceRunId) ?? readNonEmptyString(context.resumeFromRunId),
        correctiveRunId: latestRun.id,
        missingDisposition: readNonEmptyString(context.missingDisposition) ?? "clear_next_step",
        handoffAttempt,
        maxHandoffAttempts,
    };
}
function isExhaustedSuccessfulRunHandoff(latestRun) {
    const evidence = successfulRunHandoffRecoveryEvidence(latestRun);
    if (!evidence)
        return null;
    if (evidence.handoffAttempt < evidence.maxHandoffAttempts)
        return { ...evidence, exhausted: false };
    return { ...evidence, exhausted: true };
}
function issueIdFromRunContext(contextSnapshot) {
    const context = parseObject(contextSnapshot);
    return readNonEmptyString(context.issueId) ?? readNonEmptyString(context.taskId);
}
function issueIdFromWakePayload(payload) {
    const parsed = parseObject(payload);
    const nestedContext = parseObject(parsed[DEFERRED_WAKE_CONTEXT_KEY]);
    return readNonEmptyString(parsed.issueId) ??
        readNonEmptyString(nestedContext.issueId) ??
        readNonEmptyString(nestedContext.taskId);
}
function issueUiLink(issue, prefix) {
    const label = issue.identifier ?? issue.id;
    return `[${label}](/${prefix}/issues/${label})`;
}
function runUiLink(run, prefix) {
    return `[${run.id}](/${prefix}/agents/${run.agentId}/runs/${run.id})`;
}
function agentUiLink(agent, prefix) {
    if (!agent)
        return "unknown";
    return `[${agent.name ?? agent.id}](/${prefix}/agents/${agent.id})`;
}
function formatDuration(ms) {
    if (ms === null)
        return "unknown";
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60)
        return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
function formatIssueLinksForComment(relations) {
    const identifiers = [
        ...new Set(relations
            .map((relation) => relation.identifier)
            .filter((identifier) => Boolean(identifier))),
    ];
    if (identifiers.length === 0)
        return "another open issue";
    return identifiers
        .slice(0, 5)
        .map((identifier) => {
        const prefix = identifier.split("-")[0] || "PAP";
        return `[${identifier}](/${prefix}/issues/${identifier})`;
    })
        .join(", ");
}
function unwrapDatabaseConflictError(error) {
    if (!error || typeof error !== "object")
        return null;
    const candidate = error;
    if (typeof candidate.code === "string" ||
        typeof candidate.constraint === "string" ||
        typeof candidate.constraint_name === "string") {
        return candidate;
    }
    const cause = candidate.cause;
    if (!cause || typeof cause !== "object")
        return candidate;
    return cause;
}
function isAgentInvokable(agent) {
    return Boolean(agent && !["paused", "terminated", "pending_approval"].includes(agent.status));
}
function isStrandedIssueRecoveryIssue(issue) {
    return isStrandedIssueRecoveryOriginKind(issue.originKind);
}
function isUnsuccessfulTerminalIssueRun(latestRun) {
    return Boolean(latestRun &&
        UNSUCCESSFUL_HEARTBEAT_RUN_TERMINAL_STATUSES.includes(latestRun.status));
}
function isSuccessfulInProgressContinuationRun(latestRun) {
    return latestRun?.status === "succeeded";
}
function isProductiveContinuationRun(latestRun) {
    return latestRun?.status === "succeeded" &&
        (latestRun.livenessState === "advanced" ||
            latestRun.livenessState === "completed" ||
            latestRun.livenessState === "blocked" ||
            latestRun.livenessState === "needs_followup");
}
function isRepeatedProductiveContinuationRecovery(latestRun) {
    const latestContext = parseObject(latestRun.contextSnapshot);
    return readNonEmptyString(latestContext.retryReason) === "issue_continuation_needed" &&
        readNonEmptyString(latestContext.source) === "issue.productive_terminal_continuation_recovery" &&
        isProductiveContinuationRun(latestRun);
}
function parseLivenessIncidentKey(incidentKey) {
    if (!incidentKey)
        return null;
    return parseIssueGraphLivenessIncidentKey(incidentKey);
}
function livenessRecoveryLeafIssueId(finding) {
    return finding.recoveryIssueId;
}
function livenessRecoveryLeafFingerprint(finding) {
    return buildIssueGraphLivenessLeafKey({
        companyId: finding.companyId,
        state: finding.state,
        leafIssueId: livenessRecoveryLeafIssueId(finding),
    });
}
function livenessRecoveryLeafKey(companyId, state, leafIssueId) {
    return buildIssueGraphLivenessLeafKey({ companyId, state, leafIssueId });
}
function isUniqueLivenessRecoveryConflict(error) {
    if (!error || typeof error !== "object")
        return false;
    const maybe = error;
    return maybe.code === "23505" &&
        (maybe.constraint === "issues_active_liveness_recovery_incident_uq" ||
            maybe.constraint === "issues_active_liveness_recovery_leaf_uq" ||
            typeof maybe.message === "string" &&
                (maybe.message.includes("issues_active_liveness_recovery_incident_uq") ||
                    maybe.message.includes("issues_active_liveness_recovery_leaf_uq")));
}
function formatDependencyPath(finding) {
    return finding.dependencyPath
        .map((entry) => entry.identifier ?? entry.issueId)
        .join(" -> ");
}
function buildLivenessEscalationDescription(finding) {
    const source = finding.dependencyPath[0];
    const recovery = finding.dependencyPath.find((entry) => entry.issueId === finding.recoveryIssueId);
    const selectedOwner = finding.recommendedOwnerAgentId ?? "none";
    return [
        "Paperclip detected a harness-level issue graph liveness incident.",
        "",
        "## Source",
        "",
        `- Source issue: ${source?.identifier ?? source?.issueId ?? finding.issueId}`,
        `- Recovery target issue: ${recovery?.identifier ?? recovery?.issueId ?? finding.recoveryIssueId}`,
        `- Incident key: \`${finding.incidentKey}\``,
        `- Detected invariant: \`${finding.state}\``,
        `- Dependency path: ${formatDependencyPath(finding)}`,
        `- Reason: ${finding.reason}`,
        "",
        "## Ownership",
        "",
        `- Selected owner agent: \`${selectedOwner}\``,
        `- Candidate owner agents: ${finding.recommendedOwnerCandidateAgentIds.length > 0 ? finding.recommendedOwnerCandidateAgentIds.map((id) => `\`${id}\``).join(", ") : "none"}`,
        "",
        "## Next Action",
        "",
        finding.recommendedAction,
        "",
        "Resolve the blocked chain, then mark this escalation issue done so the original issue can resume when all blockers are cleared.",
    ].join("\n");
}
function buildLivenessOriginalIssueComment(finding, escalation) {
    return [
        "Paperclip detected a harness-level liveness incident in this issue's dependency graph.",
        "",
        `- Escalation issue: ${escalation.identifier ?? escalation.id}`,
        `- Incident key: \`${finding.incidentKey}\``,
        `- Finding: \`${finding.state}\``,
        `- Dependency path: ${formatDependencyPath(finding)}`,
        `- Reason: ${finding.reason}`,
        `- Manager action requested: ${finding.recommendedAction}`,
        "",
        "This issue now keeps its existing blockers and is also blocked by the escalation issue so dependency wakeups remain explicit.",
    ].join("\n");
}
export function recoveryService(db, deps) {
    const issuesSvc = issueService(db);
    const recoveryActionsSvc = issueRecoveryActionService(db);
    const treeControlSvc = issueTreeControlService(db);
    const budgets = budgetService(db);
    const instanceSettings = instanceSettingsService(db);
    const runLogStore = getRunLogStore();
    const getCurrentUserRedactionOptions = async () => ({
        enabled: (await instanceSettings.getGeneral()).censorUsernameInLogs,
    });
    async function getAgent(agentId) {
        return db.select().from(agents).where(eq(agents.id, agentId)).then((rows) => rows[0] ?? null);
    }
    async function getLatestIssueRun(companyId, issueId) {
        return db
            .select({
            id: heartbeatRuns.id,
            agentId: heartbeatRuns.agentId,
            status: heartbeatRuns.status,
            error: heartbeatRuns.error,
            errorCode: heartbeatRuns.errorCode,
            contextSnapshot: heartbeatRuns.contextSnapshot,
            livenessState: heartbeatRuns.livenessState,
        })
            .from(heartbeatRuns)
            .where(and(eq(heartbeatRuns.companyId, companyId), sql `${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issueId}`))
            .orderBy(desc(heartbeatRuns.createdAt), desc(heartbeatRuns.id))
            .limit(1)
            .then((rows) => rows[0] ?? null);
    }
    async function hasActiveExecutionPath(companyId, issueId) {
        const [run, deferredWake] = await Promise.all([
            db
                .select({ id: heartbeatRuns.id })
                .from(heartbeatRuns)
                .where(and(eq(heartbeatRuns.companyId, companyId), inArray(heartbeatRuns.status, [...EXECUTION_PATH_HEARTBEAT_RUN_STATUSES]), sql `${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issueId}`))
                .limit(1)
                .then((rows) => rows[0] ?? null),
            db
                .select({ id: agentWakeupRequests.id })
                .from(agentWakeupRequests)
                .where(and(eq(agentWakeupRequests.companyId, companyId), eq(agentWakeupRequests.status, "deferred_issue_execution"), sql `${agentWakeupRequests.payload} ->> 'issueId' = ${issueId}`))
                .limit(1)
                .then((rows) => rows[0] ?? null),
        ]);
        return Boolean(run || deferredWake);
    }
    async function hasQueuedIssueWake(companyId, issueId) {
        return db
            .select({ id: agentWakeupRequests.id })
            .from(agentWakeupRequests)
            .where(and(eq(agentWakeupRequests.companyId, companyId), eq(agentWakeupRequests.status, "queued"), sql `${agentWakeupRequests.payload} ->> 'issueId' = ${issueId}`))
            .limit(1)
            .then((rows) => Boolean(rows[0]));
    }
    async function enqueueStrandedIssueRecovery(input) {
        const queued = await deps.enqueueWakeup(input.agentId, {
            source: "automation",
            triggerDetail: "system",
            reason: input.reason,
            payload: withRecoveryModelProfileHint({
                issueId: input.issueId,
                ...(input.retryOfRunId ? { retryOfRunId: input.retryOfRunId } : {}),
            }),
            requestedByActorType: "system",
            requestedByActorId: null,
            contextSnapshot: withRecoveryModelProfileHint({
                issueId: input.issueId,
                taskId: input.issueId,
                wakeReason: input.reason,
                retryReason: input.retryReason,
                source: input.source,
                ...(input.retryOfRunId ? { retryOfRunId: input.retryOfRunId } : {}),
            }),
        });
        if (queued && input.retryOfRunId) {
            return db
                .update(heartbeatRuns)
                .set({
                retryOfRunId: input.retryOfRunId,
                updatedAt: new Date(),
            })
                .where(eq(heartbeatRuns.id, queued.id))
                .returning()
                .then((rows) => rows[0] ?? queued);
        }
        return queued;
    }
    async function enqueueInitialAssignedTodoDispatch(issue, agentId) {
        return deps.enqueueWakeup(agentId, {
            source: "assignment",
            triggerDetail: "system",
            reason: "issue_assigned",
            payload: withRecoveryModelProfileHint({
                issueId: issue.id,
                mutation: "assigned_todo_liveness_dispatch",
            }),
            requestedByActorType: "system",
            requestedByActorId: null,
            contextSnapshot: withRecoveryModelProfileHint({
                issueId: issue.id,
                taskId: issue.id,
                wakeReason: "issue_assigned",
                source: "issue.assigned_todo_liveness_dispatch",
            }),
        });
    }
    async function isInvocationBudgetBlocked(issue, agentId) {
        const budgetBlock = await budgets.getInvocationBlock(issue.companyId, agentId, {
            issueId: issue.id,
            projectId: issue.projectId,
        });
        return Boolean(budgetBlock);
    }
    async function reconcileUnassignedBlockingIssues() {
        const candidates = await db
            .select({
            id: issues.id,
            companyId: issues.companyId,
            identifier: issues.identifier,
            status: issues.status,
            createdByAgentId: issues.createdByAgentId,
        })
            .from(issueRelations)
            .innerJoin(issues, eq(issueRelations.issueId, issues.id))
            .where(and(eq(issueRelations.type, "blocks"), inArray(issues.status, ["todo", "blocked"]), isNull(issues.assigneeAgentId), isNull(issues.assigneeUserId), sql `${issues.createdByAgentId} is not null`, sql `exists (
            select 1
            from issues blocked_issue
            where blocked_issue.id = ${issueRelations.relatedIssueId}
              and blocked_issue.company_id = ${issues.companyId}
              and blocked_issue.status not in ('done', 'cancelled')
          )`));
        let assigned = 0;
        let skipped = 0;
        const issueIds = [];
        const seen = new Set();
        for (const candidate of candidates) {
            if (seen.has(candidate.id))
                continue;
            seen.add(candidate.id);
            const creatorAgentId = candidate.createdByAgentId;
            if (!creatorAgentId) {
                skipped += 1;
                continue;
            }
            const creatorAgent = await getAgent(creatorAgentId);
            if (!creatorAgent || creatorAgent.companyId !== candidate.companyId || !isAgentInvokable(creatorAgent)) {
                skipped += 1;
                continue;
            }
            const relations = await issuesSvc.getRelationSummaries(candidate.id);
            const blockingLinks = formatIssueLinksForComment(relations.blocks);
            const updated = await issuesSvc.update(candidate.id, {
                assigneeAgentId: creatorAgent.id,
                assigneeUserId: null,
            });
            if (!updated) {
                skipped += 1;
                continue;
            }
            await issuesSvc.addComment(candidate.id, [
                "## Assigned Orphan Blocker",
                "",
                `Paperclip found this issue is blocking ${blockingLinks} but had no assignee, so no heartbeat could pick it up.`,
                "",
                "- Assigned it back to the agent that created the blocker.",
                "- Next action: resolve this blocker or reassign it to the right owner.",
            ].join("\n"), {});
            await logActivity(db, {
                companyId: candidate.companyId,
                actorType: "system",
                actorId: "system",
                agentId: null,
                runId: null,
                action: "issue.updated",
                entityType: "issue",
                entityId: candidate.id,
                details: {
                    identifier: candidate.identifier,
                    assigneeAgentId: creatorAgent.id,
                    source: "recovery.reconcile_unassigned_blocking_issue",
                },
            });
            const queued = await deps.enqueueWakeup(creatorAgent.id, {
                source: "automation",
                triggerDetail: "system",
                reason: "issue_assigned",
                payload: withRecoveryModelProfileHint({
                    issueId: candidate.id,
                    mutation: "unassigned_blocker_recovery",
                }),
                requestedByActorType: "system",
                requestedByActorId: null,
                contextSnapshot: withRecoveryModelProfileHint({
                    issueId: candidate.id,
                    taskId: candidate.id,
                    wakeReason: "issue_assigned",
                    source: "issue.unassigned_blocker_recovery",
                }),
            });
            if (queued) {
                assigned += 1;
                issueIds.push(candidate.id);
            }
            else {
                skipped += 1;
            }
        }
        return { assigned, skipped, issueIds };
    }
    async function getCompanyIssuePrefix(companyId) {
        return db
            .select({ issuePrefix: companies.issuePrefix })
            .from(companies)
            .where(eq(companies.id, companyId))
            .then((rows) => rows[0]?.issuePrefix ?? "PAP");
    }
    function staleActiveRunOriginFingerprint(companyId, runId) {
        return `stale_active_run:${companyId}:${runId}`;
    }
    function isTerminalIssueStatus(status) {
        return status === "done" || status === "cancelled";
    }
    function isRecoveryOriginIssue(issue) {
        return Object.values(RECOVERY_ORIGIN_KINDS).includes(issue.originKind);
    }
    function silenceStartedAtForRun(run) {
        return run.lastOutputAt ?? run.processStartedAt ?? run.startedAt ?? run.createdAt ?? null;
    }
    function silenceAgeMsForRun(run, now = new Date()) {
        const startedAt = silenceStartedAtForRun(run);
        return startedAt ? Math.max(0, now.getTime() - startedAt.getTime()) : null;
    }
    async function latestActiveOutputQuietUntilDecision(companyId, runId, now = new Date()) {
        const [row] = await db
            .select()
            .from(heartbeatRunWatchdogDecisions)
            .where(and(eq(heartbeatRunWatchdogDecisions.companyId, companyId), eq(heartbeatRunWatchdogDecisions.runId, runId), inArray(heartbeatRunWatchdogDecisions.decision, ["snooze", "continue"]), gt(heartbeatRunWatchdogDecisions.snoozedUntil, now)))
            .orderBy(desc(heartbeatRunWatchdogDecisions.createdAt))
            .limit(1);
        return row ?? null;
    }
    async function findOpenStaleRunEvaluation(companyId, runId) {
        const [row] = await db
            .select({
            id: issues.id,
            identifier: issues.identifier,
            status: issues.status,
            priority: issues.priority,
            assigneeAgentId: issues.assigneeAgentId,
            updatedAt: issues.updatedAt,
        })
            .from(issues)
            .where(and(eq(issues.companyId, companyId), eq(issues.originKind, STALE_ACTIVE_RUN_EVALUATION_ORIGIN_KIND), eq(issues.originId, runId), isNull(issues.hiddenAt), notInArray(issues.status, ["done", "cancelled"])))
            .limit(1);
        return row ?? null;
    }
    async function buildRunOutputSilence(run, now = new Date()) {
        const [quietUntilDecision, evaluation] = await Promise.all([
            latestActiveOutputQuietUntilDecision(run.companyId, run.id, now),
            findOpenStaleRunEvaluation(run.companyId, run.id),
        ]);
        const silenceStartedAt = silenceStartedAtForRun(run);
        const silenceAgeMs = run.status === "running" ? silenceAgeMsForRun(run, now) : null;
        const level = run.status !== "running"
            ? "not_applicable"
            : quietUntilDecision
                ? "snoozed"
                : (silenceAgeMs ?? 0) >= ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS
                    ? "critical"
                    : (silenceAgeMs ?? 0) >= ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS
                        ? "suspicious"
                        : "ok";
        return {
            lastOutputAt: run.lastOutputAt ?? null,
            lastOutputSeq: run.lastOutputSeq ?? 0,
            lastOutputStream: (run.lastOutputStream === "stdout" || run.lastOutputStream === "stderr")
                ? run.lastOutputStream
                : null,
            silenceStartedAt,
            silenceAgeMs,
            level,
            suspicionThresholdMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS,
            criticalThresholdMs: ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS,
            snoozedUntil: quietUntilDecision?.snoozedUntil ?? null,
            evaluationIssueId: evaluation?.id ?? null,
            evaluationIssueIdentifier: evaluation?.identifier ?? null,
            evaluationIssueAssigneeAgentId: evaluation?.assigneeAgentId ?? null,
        };
    }
    function redactWatchdogEvidenceText(value, currentUserRedactionOptions) {
        return redactSensitiveText(redactCurrentUserText(value, currentUserRedactionOptions));
    }
    function truncateEvidenceText(value, maxChars = 4000) {
        if (value.length <= maxChars)
            return value;
        return `${value.slice(value.length - maxChars)}\n[truncated earlier evidence]`;
    }
    async function readRunLogTailForEvidence(run) {
        if (!run.logStore || !run.logRef || !run.logBytes)
            return "";
        try {
            const offset = Math.max(0, run.logBytes - ACTIVE_RUN_OUTPUT_EVIDENCE_TAIL_BYTES);
            const result = await runLogStore.read({ store: run.logStore, logRef: run.logRef }, { offset, limitBytes: ACTIVE_RUN_OUTPUT_EVIDENCE_TAIL_BYTES });
            return result.content;
        }
        catch (err) {
            logger.warn({ err, runId: run.id }, "failed to read stale-run watchdog evidence tail");
            return "";
        }
    }
    async function resolveStaleRunSourceIssue(run) {
        const issueId = issueIdFromRunContext(run.contextSnapshot);
        if (!issueId)
            return null;
        const [issue] = await db
            .select()
            .from(issues)
            .where(and(eq(issues.companyId, run.companyId), eq(issues.id, issueId), isNull(issues.hiddenAt)))
            .limit(1);
        return issue ?? null;
    }
    async function latestSameRunSourceTerminalEvidence(input) {
        if (!isTerminalIssueStatus(input.sourceIssue.status))
            return null;
        const after = input.evidenceAfter ?? input.run.startedAt ?? input.run.createdAt ?? null;
        const activityPredicates = [
            eq(activityLog.companyId, input.run.companyId),
            eq(activityLog.runId, input.run.id),
            eq(activityLog.action, "issue.updated"),
            eq(activityLog.entityType, "issue"),
            eq(activityLog.entityId, input.sourceIssue.id),
            sql `${activityLog.details} ->> 'status' = ${input.sourceIssue.status}`,
        ];
        if (after) {
            activityPredicates.push(gte(activityLog.createdAt, after));
        }
        const activity = await db
            .select({
            id: activityLog.id,
            createdAt: activityLog.createdAt,
            action: activityLog.action,
        })
            .from(activityLog)
            .where(and(...activityPredicates))
            .orderBy(desc(activityLog.createdAt))
            .limit(1)
            .then((rows) => rows[0] ?? null);
        if (activity) {
            return {
                kind: "activity",
                id: activity.id,
                createdAt: activity.createdAt,
                action: activity.action,
            };
        }
        return null;
    }
    async function nextRunEventSeq(runId) {
        const [row] = await db
            .select({ maxSeq: sql `max(${heartbeatRunEvents.seq})` })
            .from(heartbeatRunEvents)
            .where(eq(heartbeatRunEvents.runId, runId));
        return Number(row?.maxSeq ?? 0) + 1;
    }
    async function appendRecoveryRunEvent(run, event) {
        await db.insert(heartbeatRunEvents).values({
            companyId: run.companyId,
            runId: run.id,
            agentId: run.agentId,
            seq: await nextRunEventSeq(run.id),
            eventType: "lifecycle",
            stream: "system",
            level: event.level,
            message: event.message,
            payload: event.payload ?? null,
        });
    }
    async function cleanupSourceResolvedRunProcess(input) {
        if (!SESSIONED_LOCAL_ADAPTERS.has(input.runningAgent.adapterType)) {
            return {
                attempted: false,
                outcome: "skipped_non_local_adapter",
                adapterType: input.runningAgent.adapterType,
            };
        }
        const running = runningProcesses.get(input.run.id);
        const pid = running?.child.pid ?? input.run.processPid ?? null;
        const processGroupId = running?.processGroupId ?? input.run.processGroupId ?? null;
        if (typeof pid !== "number" && typeof processGroupId !== "number") {
            return {
                attempted: false,
                outcome: "no_process_metadata",
                adapterType: input.runningAgent.adapterType,
            };
        }
        const wasAlive = (typeof pid === "number" && isPidAlive(pid)) ||
            (typeof processGroupId === "number" && isProcessGroupAlive(processGroupId));
        if (!wasAlive) {
            runningProcesses.delete(input.run.id);
            return {
                attempted: false,
                outcome: "not_running",
                adapterType: input.runningAgent.adapterType,
                pid,
                processGroupId,
            };
        }
        try {
            await terminateLocalService({
                pid: typeof pid === "number" && Number.isInteger(pid) && pid > 0
                    ? pid
                    : (processGroupId ?? 0),
                processGroupId: typeof processGroupId === "number" && Number.isInteger(processGroupId) && processGroupId > 0
                    ? processGroupId
                    : null,
            }, running ? { forceAfterMs: Math.max(1, running.graceSec) * 1000 } : undefined);
            runningProcesses.delete(input.run.id);
            const stillAlive = (typeof pid === "number" && isPidAlive(pid)) ||
                (typeof processGroupId === "number" && isProcessGroupAlive(processGroupId));
            return {
                attempted: true,
                outcome: stillAlive ? "termination_sent_still_running" : "terminated",
                adapterType: input.runningAgent.adapterType,
                pid,
                processGroupId,
            };
        }
        catch (error) {
            return {
                attempted: true,
                outcome: "failed",
                adapterType: input.runningAgent.adapterType,
                pid,
                processGroupId,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async function finalizeAgentAfterSourceResolvedRun(run, status) {
        const [runningCountRow] = await db
            .select({ count: sql `count(*)::int` })
            .from(heartbeatRuns)
            .where(and(eq(heartbeatRuns.agentId, run.agentId), eq(heartbeatRuns.status, "running")));
        const runningCount = Number(runningCountRow?.count ?? 0);
        const nextStatus = runningCount > 0 ? "running" : status === "succeeded" || status === "cancelled" ? "idle" : "error";
        await db
            .update(agents)
            .set({
            status: nextStatus,
            lastHeartbeatAt: new Date(),
            updatedAt: new Date(),
        })
            .where(and(eq(agents.id, run.agentId), notInArray(agents.status, ["paused", "terminated"])));
    }
    async function foldSourceResolvedStaleRun(input) {
        if (!input.evidence)
            return { kind: "skipped" };
        const cleanup = await cleanupSourceResolvedRunProcess({ run: input.run, runningAgent: input.runningAgent });
        const finalRunStatus = input.sourceIssue.status === "cancelled" ? "cancelled" : "succeeded";
        const resultJson = {
            ...parseObject(input.run.resultJson),
            sourceResolvedWatchdogFold: {
                sourceIssueId: input.sourceIssue.id,
                sourceIssueIdentifier: input.sourceIssue.identifier,
                sourceIssueStatus: input.sourceIssue.status,
                sameRunEvidenceKind: input.evidence.kind,
                sameRunEvidenceId: input.evidence.id,
                sameRunEvidenceAt: input.evidence.createdAt.toISOString(),
                silenceStartedAt: input.silenceStartedAt?.toISOString() ?? null,
                silenceAgeMs: input.silenceAgeMs,
                evaluationIssueId: input.existingEvaluation?.id ?? null,
                evaluationIssueIdentifier: input.existingEvaluation?.identifier ?? null,
                cleanup,
            },
        };
        const finalizedRun = await db.transaction(async (tx) => {
            const [updatedRun] = await tx
                .update(heartbeatRuns)
                .set({
                status: finalRunStatus,
                finishedAt: input.now,
                error: null,
                errorCode: null,
                resultJson,
                updatedAt: input.now,
            })
                .where(and(eq(heartbeatRuns.id, input.run.id), eq(heartbeatRuns.companyId, input.run.companyId), eq(heartbeatRuns.status, "running")))
                .returning();
            if (!updatedRun)
                return null;
            if (input.run.wakeupRequestId) {
                await tx
                    .update(agentWakeupRequests)
                    .set({
                    status: finalRunStatus === "succeeded" ? "completed" : "cancelled",
                    finishedAt: input.now,
                    error: null,
                    updatedAt: input.now,
                })
                    .where(and(eq(agentWakeupRequests.id, input.run.wakeupRequestId), eq(agentWakeupRequests.companyId, input.run.companyId)));
            }
            await tx
                .update(issues)
                .set({
                executionRunId: null,
                executionAgentNameKey: null,
                executionLockedAt: null,
                updatedAt: input.now,
            })
                .where(and(eq(issues.id, input.sourceIssue.id), eq(issues.companyId, input.run.companyId), eq(issues.executionRunId, input.run.id)));
            return updatedRun;
        });
        if (!finalizedRun)
            return { kind: "skipped" };
        if (input.existingEvaluation && !isTerminalIssueStatus(input.existingEvaluation.status)) {
            await issuesSvc.update(input.existingEvaluation.id, { status: "done" });
            await issuesSvc.addComment(input.existingEvaluation.id, [
                "Source-resolved watchdog fold.",
                "",
                `- Source issue: ${input.sourceIssue.identifier ?? input.sourceIssue.id}`,
                `- Run: \`${input.run.id}\``,
                `- Same-run evidence: \`${input.evidence.kind}:${input.evidence.id}\` at ${input.evidence.createdAt.toISOString()}`,
                "- Outcome: false positive; the source issue already reached a terminal disposition from this run.",
            ].join("\n"), { runId: input.run.id });
        }
        const activeRecoveryAction = await recoveryActionsSvc.getActiveForIssue(input.run.companyId, input.sourceIssue.id);
        if (activeRecoveryAction?.kind === "active_run_watchdog") {
            await recoveryActionsSvc.resolveActiveForIssue({
                companyId: input.run.companyId,
                sourceIssueId: input.sourceIssue.id,
                actionId: activeRecoveryAction.id,
                status: "resolved",
                outcome: "false_positive",
                resolutionNote: "Source issue reached a terminal disposition through durable same-run activity; watchdog folded as source-resolved.",
            });
        }
        const [decision] = await db
            .insert(heartbeatRunWatchdogDecisions)
            .values({
            companyId: input.run.companyId,
            runId: input.run.id,
            evaluationIssueId: input.existingEvaluation?.id ?? null,
            decision: "dismissed_false_positive",
            reason: "Source issue already reached a terminal disposition through durable same-run activity.",
            createdByRunId: input.run.id,
        })
            .returning();
        await appendRecoveryRunEvent(finalizedRun, {
            level: cleanup.outcome === "failed" ? "warn" : "info",
            message: "Source-resolved watchdog fold finalized stale active run",
            payload: resultJson.sourceResolvedWatchdogFold,
        });
        await logActivity(db, {
            companyId: input.run.companyId,
            actorType: "system",
            actorId: "system",
            agentId: input.run.agentId,
            runId: input.run.id,
            action: "heartbeat.output_stale_source_resolved",
            entityType: "heartbeat_run",
            entityId: input.run.id,
            details: {
                source: "recovery.scan_silent_active_runs",
                sourceIssueId: input.sourceIssue.id,
                sourceIssueIdentifier: input.sourceIssue.identifier,
                sourceIssueStatus: input.sourceIssue.status,
                evaluationIssueId: input.existingEvaluation?.id ?? null,
                watchdogDecisionId: decision.id,
                sameRunEvidenceKind: input.evidence.kind,
                sameRunEvidenceId: input.evidence.id,
                sameRunEvidenceAt: input.evidence.createdAt.toISOString(),
                cleanup,
            },
        });
        await finalizeAgentAfterSourceResolvedRun(finalizedRun, finalRunStatus);
        return { kind: "folded", evaluationIssueId: input.existingEvaluation?.id ?? null };
    }
    async function resolveStaleRunOwnerAgentId(input) {
        const candidateIds = [];
        if (input.sourceIssue?.assigneeAgentId) {
            const sourceAssignee = await getAgent(input.sourceIssue.assigneeAgentId);
            if (sourceAssignee?.reportsTo)
                candidateIds.push(sourceAssignee.reportsTo);
        }
        if (input.runningAgent.reportsTo)
            candidateIds.push(input.runningAgent.reportsTo);
        const roleCandidates = await db
            .select()
            .from(agents)
            .where(and(eq(agents.companyId, input.run.companyId), inArray(agents.role, ["cto", "ceo"])))
            .orderBy(sql `case when ${agents.role} = 'cto' then 0 else 1 end`, asc(agents.createdAt));
        candidateIds.push(...roleCandidates.map((agent) => agent.id));
        const seen = new Set();
        for (const agentId of candidateIds) {
            if (seen.has(agentId))
                continue;
            seen.add(agentId);
            const candidate = await getAgent(agentId);
            if (!candidate || candidate.companyId !== input.run.companyId)
                continue;
            const budgetBlock = await budgets.getInvocationBlock(input.run.companyId, candidate.id, {
                issueId: input.sourceIssue?.id ?? null,
                projectId: input.sourceIssue?.projectId ?? null,
            });
            if (isAgentInvokable(candidate) && !budgetBlock)
                return candidate.id;
        }
        return null;
    }
    async function collectStaleRunEvidence(input) {
        const [tail, recentEvents, childIssues, blockers] = await Promise.all([
            readRunLogTailForEvidence(input.run),
            db
                .select({
                eventType: heartbeatRunEvents.eventType,
                level: heartbeatRunEvents.level,
                message: heartbeatRunEvents.message,
                createdAt: heartbeatRunEvents.createdAt,
            })
                .from(heartbeatRunEvents)
                .where(and(eq(heartbeatRunEvents.companyId, input.run.companyId), eq(heartbeatRunEvents.runId, input.run.id)))
                .orderBy(desc(heartbeatRunEvents.id))
                .limit(8),
            input.sourceIssue
                ? db
                    .select({ id: issues.id, identifier: issues.identifier, title: issues.title, status: issues.status })
                    .from(issues)
                    .where(and(eq(issues.companyId, input.run.companyId), eq(issues.parentId, input.sourceIssue.id), isNull(issues.hiddenAt)))
                    .orderBy(desc(issues.updatedAt))
                    .limit(8)
                : Promise.resolve([]),
            input.sourceIssue
                ? db
                    .select({ id: issues.id, identifier: issues.identifier, title: issues.title, status: issues.status })
                    .from(issueRelations)
                    .innerJoin(issues, eq(issueRelations.issueId, issues.id))
                    .where(and(eq(issueRelations.companyId, input.run.companyId), eq(issueRelations.relatedIssueId, input.sourceIssue.id), eq(issueRelations.type, "blocks")))
                    .limit(8)
                : Promise.resolve([]),
        ]);
        const currentUserRedactionOptions = await getCurrentUserRedactionOptions();
        const safeTail = truncateEvidenceText(redactWatchdogEvidenceText(tail, currentUserRedactionOptions));
        const silenceAgeMs = silenceAgeMsForRun(input.run, input.now);
        return {
            safeTail,
            silenceAgeMs,
            recentEvents: recentEvents.reverse().map((event) => ({
                eventType: event.eventType,
                level: event.level,
                createdAt: event.createdAt.toISOString(),
                message: event.message ? truncateEvidenceText(redactWatchdogEvidenceText(event.message, currentUserRedactionOptions), 300) : null,
            })),
            childIssues,
            blockers,
        };
    }
    function buildStaleRunEvaluationDescription(input) {
        const sourceIssue = input.sourceIssue
            ? issueUiLink({ identifier: input.sourceIssue.identifier, id: input.sourceIssue.id }, input.prefix)
            : "none";
        const recentEvents = input.evidence.recentEvents.length > 0
            ? input.evidence.recentEvents.map((event) => `- ${event.createdAt} \`${event.eventType}\`${event.level ? ` ${event.level}` : ""}: ${event.message ?? "(no message)"}`).join("\n")
            : "- none";
        const childIssues = input.evidence.childIssues.length > 0
            ? input.evidence.childIssues.map((issue) => `- ${issueUiLink({ identifier: issue.identifier, id: issue.id }, input.prefix)} \`${issue.status}\`: ${issue.title}`).join("\n")
            : "- none detected";
        const blockers = input.evidence.blockers.length > 0
            ? input.evidence.blockers.map((issue) => `- ${issueUiLink({ identifier: issue.identifier, id: issue.id }, input.prefix)} \`${issue.status}\`: ${issue.title}`).join("\n")
            : "- none detected";
        return [
            `Paperclip detected ${input.level} output silence on an active heartbeat run.`,
            "",
            "## Run",
            "",
            `- Run: ${runUiLink(input.run, input.prefix)}`,
            `- Agent: ${input.runningAgent.name} (${input.runningAgent.adapterType})`,
            `- Invocation: ${input.run.invocationSource}${input.run.triggerDetail ? ` / ${input.run.triggerDetail}` : ""}`,
            `- Source issue: ${sourceIssue}`,
            `- Started at: ${input.run.startedAt?.toISOString() ?? "unknown"}`,
            `- Process started at: ${input.run.processStartedAt?.toISOString() ?? "unknown"}`,
            `- Last output at: ${input.run.lastOutputAt?.toISOString() ?? "none recorded"}`,
            `- Last output sequence: ${input.run.lastOutputSeq ?? 0}`,
            `- Silent for: ${formatDuration(input.evidence.silenceAgeMs)}`,
            `- Thresholds: suspicious after ${formatDuration(ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS)}, critical after ${formatDuration(ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS)}`,
            `- Process metadata: pid \`${input.run.processPid ?? "unknown"}\`, process group \`${input.run.processGroupId ?? "unknown"}\`, in-memory handle \`${runningProcesses.has(input.run.id) ? "yes" : "no"}\``,
            "",
            "## Last Output Excerpt",
            "",
            input.evidence.safeTail ? `\`\`\`text\n${input.evidence.safeTail}\n\`\`\`` : "_No run-log tail was available._",
            "",
            "## Recent Run Events",
            "",
            recentEvents,
            "",
            "## Related Work",
            "",
            "Active child issues:",
            childIssues,
            "",
            "Current source blockers:",
            blockers,
            "",
            "## Decision Checklist",
            "",
            "- Continue or snooze if the run is intentionally quiet.",
            "- Ask the run owner for context if work may be delegated outside the transcript.",
            "- Preserve artifacts, branch state, and useful output before cancellation.",
            "- Cancel or recover through the explicit run recovery controls when authorized.",
            "- Close this issue as a false positive only after recording the reason.",
        ].join("\n");
    }
    function isUniqueStaleRunEvaluationConflict(error) {
        const maybe = unwrapDatabaseConflictError(error);
        if (!maybe)
            return false;
        return maybe.code === "23505" &&
            (maybe.constraint === "issues_active_stale_run_evaluation_uq" ||
                maybe.constraint_name === "issues_active_stale_run_evaluation_uq" ||
                typeof maybe.message === "string" && maybe.message.includes("issues_active_stale_run_evaluation_uq"));
    }
    function isUniqueStrandedIssueRecoveryConflict(error) {
        const maybe = unwrapDatabaseConflictError(error);
        if (!maybe)
            return false;
        return maybe.code === "23505" &&
            (maybe.constraint === "issues_active_stranded_issue_recovery_uq" ||
                maybe.constraint_name === "issues_active_stranded_issue_recovery_uq" ||
                typeof maybe.message === "string" && maybe.message.includes("issues_active_stranded_issue_recovery_uq"));
    }
    async function ensureSourceIssueBlockedByStaleEvaluation(input) {
        if (!input.sourceIssue || ["done", "cancelled"].includes(input.sourceIssue.status))
            return false;
        const blockerIds = await existingBlockerIssueIds(input.sourceIssue.companyId, input.sourceIssue.id);
        if (blockerIds.includes(input.evaluationIssue.id))
            return false;
        const nextBlockerIds = [...blockerIds, input.evaluationIssue.id];
        await issuesSvc.update(input.sourceIssue.id, {
            ...(input.sourceIssue.status === "blocked" ? {} : { status: "blocked" }),
            blockedByIssueIds: nextBlockerIds,
        });
        await issuesSvc.addComment(input.sourceIssue.id, [
            "Paperclip detected critical output silence on this issue's active run.",
            "",
            `- Evaluation issue: ${input.evaluationIssue.identifier ?? input.evaluationIssue.id}`,
            `- Run: \`${input.run.id}\``,
            "",
            "This blocks the source issue on the explicit review task without cancelling the active process.",
        ].join("\n"), { runId: input.run.id });
        await logActivity(db, {
            companyId: input.sourceIssue.companyId,
            actorType: "system",
            actorId: "system",
            agentId: null,
            runId: input.run.id,
            action: "heartbeat.output_stale_escalated",
            entityType: "issue",
            entityId: input.sourceIssue.id,
            details: {
                source: "recovery.scan_silent_active_runs",
                evaluationIssueId: input.evaluationIssue.id,
                blockerIssueIds: nextBlockerIds,
            },
        });
        return true;
    }
    async function createOrUpdateStaleRunEvaluation(input) {
        const runningAgent = await getAgent(input.run.agentId);
        if (!runningAgent || runningAgent.companyId !== input.run.companyId)
            return { kind: "skipped" };
        const sourceIssue = await resolveStaleRunSourceIssue(input.run);
        const existing = await findOpenStaleRunEvaluation(input.run.companyId, input.run.id);
        if (sourceIssue && isRecoveryOriginIssue(sourceIssue)) {
            await logActivity(db, {
                companyId: input.run.companyId,
                actorType: "system",
                actorId: "system",
                agentId: input.run.agentId,
                runId: input.run.id,
                action: "heartbeat.output_stale_recovery_recursion_refused",
                entityType: "heartbeat_run",
                entityId: input.run.id,
                details: {
                    source: "recovery.scan_silent_active_runs",
                    sourceIssueId: sourceIssue.id,
                    sourceIssueIdentifier: sourceIssue.identifier,
                    sourceIssueOriginKind: sourceIssue.originKind,
                    existingEvaluationIssueId: existing?.id ?? null,
                },
            });
            return { kind: "skipped" };
        }
        const silenceStartedAt = silenceStartedAtForRun(input.run);
        if (sourceIssue && isTerminalIssueStatus(sourceIssue.status)) {
            const terminalEvidence = await latestSameRunSourceTerminalEvidence({
                run: input.run,
                sourceIssue,
                evidenceAfter: silenceStartedAt,
            });
            if (terminalEvidence) {
                return foldSourceResolvedStaleRun({
                    run: input.run,
                    runningAgent,
                    sourceIssue,
                    evidence: terminalEvidence,
                    existingEvaluation: existing,
                    silenceStartedAt,
                    silenceAgeMs: silenceAgeMsForRun(input.run, input.now),
                    now: input.now,
                });
            }
        }
        const prefix = await getCompanyIssuePrefix(input.run.companyId);
        const evidence = await collectStaleRunEvidence({
            run: input.run,
            runningAgent,
            sourceIssue,
            prefix,
            now: input.now,
        });
        const level = (evidence.silenceAgeMs ?? 0) >= ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS ? "critical" : "suspicious";
        if (existing) {
            if (level === "critical" && existing.priority !== "high") {
                await issuesSvc.update(existing.id, {
                    priority: "high",
                });
                await issuesSvc.addComment(existing.id, [
                    "Critical output silence threshold crossed.",
                    "",
                    `- Run: \`${input.run.id}\``,
                    `- Silent for: ${formatDuration(evidence.silenceAgeMs)}`,
                    `- Last output at: ${input.run.lastOutputAt?.toISOString() ?? "none recorded"}`,
                ].join("\n"), { runId: input.run.id });
                await ensureSourceIssueBlockedByStaleEvaluation({
                    sourceIssue,
                    evaluationIssue: existing,
                    run: input.run,
                });
                return { kind: "escalated", evaluationIssueId: existing.id };
            }
            if (level === "critical") {
                await ensureSourceIssueBlockedByStaleEvaluation({
                    sourceIssue,
                    evaluationIssue: existing,
                    run: input.run,
                });
            }
            return { kind: "existing", evaluationIssueId: existing.id };
        }
        const ownerAgentId = await resolveStaleRunOwnerAgentId({ run: input.run, runningAgent, sourceIssue });
        const description = buildStaleRunEvaluationDescription({
            run: input.run,
            runningAgent,
            sourceIssue,
            prefix,
            evidence,
            level,
            now: input.now,
        });
        let evaluation;
        try {
            evaluation = await issuesSvc.create(input.run.companyId, {
                title: `Review silent active run for ${runningAgent.name}`,
                description,
                status: "todo",
                priority: level === "critical" ? "high" : "medium",
                parentId: sourceIssue && !["done", "cancelled"].includes(sourceIssue.status) ? sourceIssue.id : null,
                projectId: sourceIssue?.projectId ?? null,
                goalId: sourceIssue?.goalId ?? null,
                billingCode: sourceIssue?.billingCode ?? null,
                assigneeAgentId: ownerAgentId,
                assigneeAdapterOverrides: recoveryAssigneeAdapterOverrides(),
                originKind: STALE_ACTIVE_RUN_EVALUATION_ORIGIN_KIND,
                originId: input.run.id,
                originRunId: input.run.id,
                originFingerprint: staleActiveRunOriginFingerprint(input.run.companyId, input.run.id),
            });
        }
        catch (error) {
            if (!isUniqueStaleRunEvaluationConflict(error))
                throw error;
            const raced = await findOpenStaleRunEvaluation(input.run.companyId, input.run.id);
            if (!raced)
                throw error;
            return { kind: "existing", evaluationIssueId: raced.id };
        }
        await logActivity(db, {
            companyId: input.run.companyId,
            actorType: "system",
            actorId: "system",
            agentId: ownerAgentId,
            runId: input.run.id,
            action: "heartbeat.output_stale_detected",
            entityType: "issue",
            entityId: evaluation.id,
            details: {
                source: "recovery.scan_silent_active_runs",
                level,
                sourceIssueId: sourceIssue?.id ?? null,
                silenceAgeMs: evidence.silenceAgeMs,
                lastOutputAt: input.run.lastOutputAt?.toISOString() ?? null,
            },
        });
        if (level === "critical") {
            await ensureSourceIssueBlockedByStaleEvaluation({
                sourceIssue,
                evaluationIssue: evaluation,
                run: input.run,
            });
        }
        if (ownerAgentId) {
            await deps.enqueueWakeup(ownerAgentId, {
                source: "assignment",
                triggerDetail: "system",
                reason: "issue_assigned",
                payload: withRecoveryModelProfileHint({
                    issueId: evaluation.id,
                    staleRunId: input.run.id,
                    sourceIssueId: sourceIssue?.id ?? null,
                }),
                requestedByActorType: "system",
                requestedByActorId: null,
                contextSnapshot: withRecoveryModelProfileHint({
                    issueId: evaluation.id,
                    taskId: evaluation.id,
                    wakeReason: "issue_assigned",
                    source: STALE_ACTIVE_RUN_EVALUATION_ORIGIN_KIND,
                    staleRunId: input.run.id,
                    sourceIssueId: sourceIssue?.id ?? null,
                }),
            });
        }
        return { kind: "created", evaluationIssueId: evaluation.id };
    }
    async function scanSilentActiveRuns(opts) {
        const now = opts?.now ?? new Date();
        const suspicionBefore = new Date(now.getTime() - ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS);
        const candidates = await db
            .select()
            .from(heartbeatRuns)
            .where(and(opts?.companyId ? eq(heartbeatRuns.companyId, opts.companyId) : undefined, eq(heartbeatRuns.status, "running"), sql `coalesce(${heartbeatRuns.lastOutputAt}, ${heartbeatRuns.processStartedAt}, ${heartbeatRuns.startedAt}, ${heartbeatRuns.createdAt}) <= ${suspicionBefore.toISOString()}::timestamptz`))
            .orderBy(asc(heartbeatRuns.createdAt))
            .limit(100);
        const result = {
            scanned: candidates.length,
            created: 0,
            existing: 0,
            escalated: 0,
            folded: 0,
            snoozed: 0,
            skipped: 0,
            evaluationIssueIds: [],
        };
        for (const run of candidates) {
            if (await latestActiveOutputQuietUntilDecision(run.companyId, run.id, now)) {
                result.snoozed += 1;
                continue;
            }
            const outcome = await createOrUpdateStaleRunEvaluation({ run, now });
            if (outcome.kind === "created")
                result.created += 1;
            else if (outcome.kind === "existing")
                result.existing += 1;
            else if (outcome.kind === "escalated")
                result.escalated += 1;
            else if (outcome.kind === "folded")
                result.folded += 1;
            else
                result.skipped += 1;
            if ("evaluationIssueId" in outcome && outcome.evaluationIssueId) {
                result.evaluationIssueIds.push(outcome.evaluationIssueId);
            }
        }
        return result;
    }
    async function recordWatchdogDecision(input) {
        const [run] = await db
            .select()
            .from(heartbeatRuns)
            .where(eq(heartbeatRuns.id, input.runId))
            .limit(1);
        if (!run)
            throw notFound("Heartbeat run not found");
        let evaluationIssue = null;
        if (input.evaluationIssueId) {
            evaluationIssue = await db
                .select({
                id: issues.id,
                assigneeAgentId: issues.assigneeAgentId,
                companyId: issues.companyId,
                originKind: issues.originKind,
                originId: issues.originId,
                hiddenAt: issues.hiddenAt,
                status: issues.status,
            })
                .from(issues)
                .where(and(eq(issues.id, input.evaluationIssueId), eq(issues.companyId, run.companyId)))
                .then((rows) => rows[0] ?? null);
            if (!evaluationIssue)
                throw notFound("Evaluation issue not found");
        }
        const boardActor = input.actor.type === "board";
        const assignedRecoveryOwner = input.actor.type === "agent" &&
            Boolean(input.actor.agentId) &&
            evaluationIssue !== null &&
            evaluationIssue.originKind === STALE_ACTIVE_RUN_EVALUATION_ORIGIN_KIND &&
            evaluationIssue.originId === run.id &&
            evaluationIssue.hiddenAt === null &&
            !["done", "cancelled"].includes(evaluationIssue.status) &&
            evaluationIssue?.assigneeAgentId === input.actor.agentId;
        if (!boardActor && !assignedRecoveryOwner) {
            throw forbidden("Only the board or the assigned recovery owner can record watchdog decisions");
        }
        if (evaluationIssue && (evaluationIssue.originKind !== STALE_ACTIVE_RUN_EVALUATION_ORIGIN_KIND ||
            evaluationIssue.originId !== run.id)) {
            throw forbidden("Watchdog decision evaluation issue is not bound to the target run");
        }
        if (input.actor.type === "agent" && !evaluationIssue) {
            throw forbidden("Agent watchdog decisions require the target evaluation issue");
        }
        const createdByRunId = input.actor.type === "agent"
            ? input.actor.runId ?? input.createdByRunId ?? null
            : input.actor.type === "board"
                ? input.actor.runId ?? input.createdByRunId ?? null
                : null;
        if (createdByRunId) {
            const [creatorRun] = await db
                .select({ id: heartbeatRuns.id, companyId: heartbeatRuns.companyId, agentId: heartbeatRuns.agentId })
                .from(heartbeatRuns)
                .where(eq(heartbeatRuns.id, createdByRunId))
                .limit(1);
            const sameCompany = creatorRun?.companyId === run.companyId;
            const sameAgent = input.actor.type !== "agent" || creatorRun?.agentId === input.actor.agentId;
            if (!creatorRun || !sameCompany || !sameAgent) {
                throw forbidden("createdByRunId is not valid for this watchdog decision actor");
            }
        }
        const decisionNow = input.now ?? new Date();
        const effectiveSnoozedUntil = input.decision === "snooze"
            ? input.snoozedUntil ?? null
            : input.decision === "continue"
                ? input.snoozedUntil && input.snoozedUntil > decisionNow
                    ? input.snoozedUntil
                    : new Date(decisionNow.getTime() + ACTIVE_RUN_OUTPUT_CONTINUE_REARM_MS)
                : null;
        const [row] = await db
            .insert(heartbeatRunWatchdogDecisions)
            .values({
            companyId: run.companyId,
            runId: run.id,
            evaluationIssueId: input.evaluationIssueId ?? null,
            decision: input.decision,
            snoozedUntil: effectiveSnoozedUntil,
            reason: input.reason ?? null,
            createdByAgentId: input.actor.type === "agent" ? input.actor.agentId ?? null : null,
            createdByUserId: input.actor.type === "board" ? input.actor.userId ?? null : null,
            createdByRunId,
        })
            .returning();
        await logActivity(db, {
            companyId: run.companyId,
            actorType: input.actor.type === "agent" ? "agent" : "user",
            actorId: input.actor.type === "agent"
                ? input.actor.agentId ?? "agent"
                : input.actor.type === "board"
                    ? input.actor.userId ?? "board"
                    : "unknown",
            agentId: input.actor.type === "agent" ? input.actor.agentId ?? null : null,
            runId: run.id,
            action: input.decision === "snooze" ? "heartbeat.watchdog_snoozed" : "heartbeat.watchdog_decision_recorded",
            entityType: "heartbeat_run",
            entityId: run.id,
            details: {
                source: "recovery.record_watchdog_decision",
                decision: input.decision,
                evaluationIssueId: input.evaluationIssueId ?? null,
                snoozedUntil: effectiveSnoozedUntil?.toISOString() ?? null,
                reason: input.reason ?? null,
            },
        });
        return row;
    }
    async function findOpenStrandedIssueRecoveryIssue(companyId, sourceIssueId) {
        return db
            .select()
            .from(issues)
            .where(and(eq(issues.companyId, companyId), eq(issues.originKind, STRANDED_ISSUE_RECOVERY_ORIGIN_KIND), eq(issues.originId, sourceIssueId), isNull(issues.hiddenAt), notInArray(issues.status, ["done", "cancelled"])))
            .orderBy(desc(issues.createdAt))
            .limit(1)
            .then((rows) => rows[0] ?? null);
    }
    function isStrandedIssueRecoveryIssue(issue) {
        return issue.originKind === STRANDED_ISSUE_RECOVERY_ORIGIN_KIND;
    }
    async function buildNestedStrandedRecoveryLine(issue, prefix) {
        const sourceIssueId = readNonEmptyString(issue.originId);
        const sourceIssue = sourceIssueId
            ? await db
                .select({ id: issues.id, identifier: issues.identifier })
                .from(issues)
                .where(and(eq(issues.companyId, issue.companyId), eq(issues.id, sourceIssueId)))
                .then((rows) => rows[0] ?? null)
            : null;
        const sourceLine = sourceIssue
            ? `- Original source issue: ${issueUiLink(sourceIssue, prefix)}`
            : sourceIssueId
                ? `- Original source issue: \`${sourceIssueId}\``
                : "- Original source issue: unknown";
        return [
            "",
            "- Nested recovery: suppressed because this issue is already a `stranded_issue_recovery` issue.",
            sourceLine,
            "- Next action: the assigned recovery owner or board operator should fix the runtime/adapter problem, resolve or reassign the original source issue, then mark this recovery issue done or cancelled.",
        ].join("\n");
    }
    async function resolveStrandedIssueRecoveryOwnerAgentId(issue) {
        const candidateIds = [];
        if (issue.assigneeAgentId) {
            const assignee = await getAgent(issue.assigneeAgentId);
            if (assignee?.reportsTo)
                candidateIds.push(assignee.reportsTo);
        }
        if (issue.createdByAgentId) {
            const creator = await getAgent(issue.createdByAgentId);
            if (creator?.reportsTo)
                candidateIds.push(creator.reportsTo);
            candidateIds.push(issue.createdByAgentId);
        }
        const roleCandidates = await db
            .select()
            .from(agents)
            .where(and(eq(agents.companyId, issue.companyId), inArray(agents.role, ["cto", "ceo"])))
            .orderBy(sql `case when ${agents.role} = 'cto' then 0 else 1 end`, asc(agents.createdAt));
        candidateIds.push(...roleCandidates.map((agent) => agent.id));
        if (issue.assigneeAgentId)
            candidateIds.push(issue.assigneeAgentId);
        const seen = new Set();
        for (const agentId of candidateIds) {
            if (seen.has(agentId))
                continue;
            seen.add(agentId);
            const candidate = await getAgent(agentId);
            if (!candidate || candidate.companyId !== issue.companyId)
                continue;
            const budgetBlock = await budgets.getInvocationBlock(issue.companyId, candidate.id, {
                issueId: issue.id,
                projectId: issue.projectId,
            });
            if (isAgentInvokable(candidate) && !budgetBlock)
                return candidate.id;
        }
        return null;
    }
    function buildStrandedIssueRecoveryDescription(input) {
        const sourceIssue = issueUiLink({ identifier: input.issue.identifier, id: input.issue.id }, input.prefix);
        const runLink = input.latestRun
            ? `[\`${input.latestRun.id}\`](/${input.prefix}/agents/${input.latestRun.agentId}/runs/${input.latestRun.id})`
            : "none";
        if (input.recoveryCause === SUCCESSFUL_RUN_MISSING_STATE_REASON) {
            const sourceRunId = input.successfulRunHandoffEvidence?.sourceRunId;
            const sourceRunLink = sourceRunId && input.latestRun
                ? `[\`${sourceRunId}\`](/${input.prefix}/agents/${input.latestRun.agentId}/runs/${sourceRunId})`
                : "unknown";
            const missingDisposition = input.successfulRunHandoffEvidence?.missingDisposition ?? "clear_next_step";
            return [
                "Paperclip exhausted the bounded corrective handoff for a successful run that still has no valid issue disposition.",
                "",
                "This is not a runtime/adapter crash report. The source run succeeded; the remaining problem is the missing `done`, `in_review`, `blocked`, delegated follow-up, or explicit continuation path.",
                "",
                "## Safe Evidence",
                "",
                `- Source issue: ${sourceIssue}`,
                `- Source run: ${sourceRunLink}`,
                `- Corrective handoff run: ${runLink}`,
                `- Source assignee: ${agentUiLink(input.sourceAssignee ?? null, input.prefix)}`,
                `- Latest issue status: \`${input.issue.status}\``,
                `- Latest handoff run status: \`${input.latestRun?.status ?? "unknown"}\``,
                `- Normalized cause: \`${SUCCESSFUL_RUN_MISSING_STATE_REASON}\``,
                `- Missing disposition: \`${missingDisposition}\``,
                "- Suggested manager action: choose and record a valid issue disposition without copying transcript content.",
                "",
                "## Required Action",
                "",
                "- Inspect the source issue and run metadata, not raw transcript excerpts.",
                "- Choose a valid issue disposition: `done`/`cancelled`, `in_review` with an owner, `blocked` with first-class blockers, delegated follow-up work, or an explicit continuation path.",
                "- When the source issue has a clear owner and disposition, mark this recovery issue done.",
            ].join("\n");
        }
        const retryReason = readNonEmptyString(parseObject(input.latestRun?.contextSnapshot)?.retryReason) ?? "unknown";
        const failureSummary = summarizeRunFailureForIssueComment(input.latestRun);
        return [
            "Paperclip exhausted automatic recovery for an assigned issue and created this explicit recovery task.",
            "",
            "## Source",
            "",
            `- Source issue: ${sourceIssue}`,
            `- Previous source status: \`${input.previousStatus}\``,
            `- Latest retry run: ${runLink}`,
            `- Latest retry status: \`${input.latestRun?.status ?? "unknown"}\``,
            `- Detected invariant: \`stranded_assigned_issue\``,
            `- Retry reason: \`${retryReason}\``,
            failureSummary ? `- Failure: ${failureSummary.trim()}` : "- Failure: none recorded",
            "",
            "## Ownership",
            "",
            "- Selected owner: the first invokable manager/creator/executive candidate with budget available.",
            "",
            "## Required Action",
            "",
            "- Inspect the latest run and source issue state.",
            "- Fix the runtime/adapter problem, reassign the source issue, or convert the source issue into a clear manual-review state.",
            "- When the source issue has a live execution path or has been intentionally resolved, mark this recovery issue done.",
        ].join("\n");
    }
    async function ensureStrandedIssueRecoveryIssue(input) {
        if (isStrandedIssueRecoveryIssue(input.issue))
            return null;
        const existing = await findOpenStrandedIssueRecoveryIssue(input.issue.companyId, input.issue.id);
        if (existing)
            return existing;
        const ownerAgentId = await resolveStrandedIssueRecoveryOwnerAgentId(input.issue);
        if (!ownerAgentId)
            return null;
        const prefix = await getCompanyIssuePrefix(input.issue.companyId);
        const sourceAssignee = input.issue.assigneeAgentId ? await getAgent(input.issue.assigneeAgentId) : null;
        const recoveryCause = input.recoveryCause ?? "stranded_assigned_issue";
        let recovery;
        try {
            recovery = await issuesSvc.create(input.issue.companyId, {
                title: recoveryCause === SUCCESSFUL_RUN_MISSING_STATE_REASON
                    ? `Recover missing next step ${input.issue.identifier ?? input.issue.title}`
                    : `Recover stalled issue ${input.issue.identifier ?? input.issue.title}`,
                description: buildStrandedIssueRecoveryDescription({
                    issue: input.issue,
                    latestRun: input.latestRun,
                    previousStatus: input.previousStatus,
                    prefix,
                    recoveryCause,
                    successfulRunHandoffEvidence: input.successfulRunHandoffEvidence,
                    sourceAssignee,
                }),
                status: "todo",
                priority: input.issue.priority,
                parentId: input.issue.id,
                projectId: input.issue.projectId,
                goalId: input.issue.goalId,
                assigneeAgentId: ownerAgentId,
                assigneeAdapterOverrides: recoveryAssigneeAdapterOverrides(),
                originKind: STRANDED_ISSUE_RECOVERY_ORIGIN_KIND,
                originId: input.issue.id,
                originRunId: input.latestRun?.id ?? null,
                originFingerprint: [
                    STRANDED_ISSUE_RECOVERY_ORIGIN_KIND,
                    input.issue.companyId,
                    input.issue.id,
                    recoveryCause,
                    input.latestRun?.id ?? "no-run",
                ].join(":"),
                billingCode: input.issue.billingCode,
                inheritExecutionWorkspaceFromIssueId: input.issue.id,
            });
        }
        catch (error) {
            if (!isUniqueStrandedIssueRecoveryConflict(error))
                throw error;
            const raced = await findOpenStrandedIssueRecoveryIssue(input.issue.companyId, input.issue.id);
            if (!raced)
                throw error;
            return raced;
        }
        await deps.enqueueWakeup(ownerAgentId, {
            source: "assignment",
            triggerDetail: "system",
            reason: "issue_assigned",
            payload: withRecoveryModelProfileHint({
                issueId: recovery.id,
                sourceIssueId: input.issue.id,
                strandedRunId: input.latestRun?.id ?? null,
                recoveryCause,
            }),
            requestedByActorType: "system",
            requestedByActorId: null,
            contextSnapshot: withRecoveryModelProfileHint({
                issueId: recovery.id,
                taskId: recovery.id,
                wakeReason: "issue_assigned",
                source: STRANDED_ISSUE_RECOVERY_ORIGIN_KIND,
                sourceIssueId: input.issue.id,
                strandedRunId: input.latestRun?.id ?? null,
                recoveryCause,
            }),
        });
        return recovery;
    }
    function strandedRecoveryActionKind(cause) {
        return cause === SUCCESSFUL_RUN_MISSING_STATE_REASON
            ? "missing_disposition"
            : "stranded_assigned_issue";
    }
    function strandedRecoveryActionFingerprint(input) {
        return [
            "source_scoped_recovery",
            input.issue.companyId,
            input.issue.id,
            input.recoveryCause,
        ].join(":");
    }
    function buildStrandedRecoveryActionEvidence(input) {
        const context = parseObject(input.latestRun?.contextSnapshot);
        return {
            sourceIssueId: input.issue.id,
            sourceIdentifier: input.issue.identifier,
            previousStatus: input.previousStatus,
            latestIssueStatus: input.issue.status,
            latestRunId: input.latestRun?.id ?? null,
            latestRunStatus: input.latestRun?.status ?? null,
            latestRunErrorCode: input.latestRun?.errorCode ?? null,
            retryReason: readNonEmptyString(context.retryReason) ?? null,
            recoveryCause: input.recoveryCause,
            sourceRunId: input.successfulRunHandoffEvidence?.sourceRunId ?? null,
            correctiveRunId: input.successfulRunHandoffEvidence?.correctiveRunId ?? null,
            missingDisposition: input.successfulRunHandoffEvidence?.missingDisposition ?? null,
            handoffAttempt: input.successfulRunHandoffEvidence?.handoffAttempt ?? null,
            maxHandoffAttempts: input.successfulRunHandoffEvidence?.maxHandoffAttempts ?? null,
        };
    }
    async function ensureSourceScopedStrandedRecoveryAction(input) {
        const recoveryCause = input.recoveryCause ?? "stranded_assigned_issue";
        const ownerAgentId = await resolveStrandedIssueRecoveryOwnerAgentId(input.issue);
        const now = new Date();
        const action = await recoveryActionsSvc.upsertSourceScoped({
            companyId: input.issue.companyId,
            sourceIssueId: input.issue.id,
            kind: strandedRecoveryActionKind(recoveryCause),
            ownerType: ownerAgentId ? "agent" : "board",
            ownerAgentId,
            previousOwnerAgentId: input.issue.assigneeAgentId,
            returnOwnerAgentId: input.issue.assigneeAgentId,
            cause: recoveryCause,
            fingerprint: strandedRecoveryActionFingerprint({
                issue: input.issue,
                recoveryCause,
            }),
            evidence: buildStrandedRecoveryActionEvidence({
                issue: input.issue,
                latestRun: input.latestRun,
                previousStatus: input.previousStatus,
                recoveryCause,
                successfulRunHandoffEvidence: input.successfulRunHandoffEvidence,
            }),
            nextAction: recoveryCause === SUCCESSFUL_RUN_MISSING_STATE_REASON
                ? "Choose and record a valid issue disposition without copying transcript content."
                : "Restore a live execution path, fix the runtime/adapter failure, or record an intentional manual resolution.",
            wakePolicy: ownerAgentId
                ? {
                    type: "wake_owner",
                    reason: "source_scoped_recovery_action",
                    ownerAgentId,
                }
                : {
                    type: "board_escalation",
                    reason: "no_invokable_recovery_owner",
                },
            monitorPolicy: null,
            maxAttempts: null,
            lastAttemptAt: now,
        });
        return action;
    }
    async function enqueueSourceScopedStrandedRecoveryWake(input) {
        if (!input.action.ownerAgentId)
            return;
        await deps.enqueueWakeup(input.action.ownerAgentId, {
            source: "assignment",
            triggerDetail: "system",
            reason: "source_scoped_recovery_action",
            idempotencyKey: `source_scoped_recovery_action:${input.action.id}:${input.action.attemptCount}`,
            payload: withRecoveryModelProfileHint({
                issueId: input.issue.id,
                sourceIssueId: input.issue.id,
                recoveryActionId: input.action.id,
                strandedRunId: input.latestRun?.id ?? null,
                recoveryCause: input.recoveryCause,
            }),
            requestedByActorType: "system",
            requestedByActorId: null,
            contextSnapshot: withRecoveryModelProfileHint({
                issueId: input.issue.id,
                taskId: input.issue.id,
                wakeReason: "source_scoped_recovery_action",
                skipIssueComment: true,
                source: "issue_recovery_action",
                recoveryActionId: input.action.id,
                sourceIssueId: input.issue.id,
                strandedRunId: input.latestRun?.id ?? null,
                recoveryCause: input.recoveryCause,
            }),
        });
    }
    function buildRecoveryIssueInPlaceEscalationComment(input) {
        const runLink = input.latestRun
            ? runUiLink({ id: input.latestRun.id, agentId: input.latestRun.agentId }, input.prefix)
            : "none";
        const retryReason = readNonEmptyString(parseObject(input.latestRun?.contextSnapshot)?.retryReason) ?? "none";
        const failureSummary = summarizeRunFailureForIssueComment(input.latestRun);
        return [
            "Paperclip stopped automatic stranded-work recovery for this recovery issue.",
            "",
            `- Recovery issue: ${issueUiLink({ identifier: input.issue.identifier, id: input.issue.id }, input.prefix)}`,
            `- Previous status: \`${input.previousStatus}\``,
            `- Latest run: ${runLink}`,
            `- Latest run status: \`${input.latestRun?.status ?? "unknown"}\``,
            `- Retry reason: \`${retryReason}\``,
            failureSummary ? `- Failure: ${failureSummary.trim()}` : "- Failure: none recorded",
            "- Guard: recovery issues do not create nested `stranded_issue_recovery` issues.",
            "",
            "Next action: the current recovery owner should inspect the failed run evidence, restore a live execution path or record the manual resolution, then move this recovery issue out of `blocked`.",
        ].join("\n");
    }
    async function escalateStrandedRecoveryIssueInPlace(input) {
        const updated = await issuesSvc.update(input.issue.id, { status: "blocked" });
        if (!updated)
            return null;
        const prefix = await getCompanyIssuePrefix(input.issue.companyId);
        await issuesSvc.addComment(input.issue.id, buildRecoveryIssueInPlaceEscalationComment({
            issue: input.issue,
            previousStatus: input.previousStatus,
            latestRun: input.latestRun,
            prefix,
        }), {});
        await logActivity(db, {
            companyId: input.issue.companyId,
            actorType: "system",
            actorId: "system",
            agentId: null,
            runId: null,
            action: "issue.updated",
            entityType: "issue",
            entityId: input.issue.id,
            details: {
                identifier: input.issue.identifier,
                status: "blocked",
                previousStatus: input.previousStatus,
                source: "recovery.reconcile_stranded_recovery_issue",
                latestRunId: input.latestRun?.id ?? null,
                latestRunStatus: input.latestRun?.status ?? null,
                latestRunErrorCode: input.latestRun?.errorCode ?? null,
                originKind: input.issue.originKind,
                originId: input.issue.originId,
            },
        });
        return updated;
    }
    async function existingBlockerIssueIds(companyId, issueId) {
        return db
            .select({ blockerIssueId: issueRelations.issueId })
            .from(issueRelations)
            .where(and(eq(issueRelations.companyId, companyId), eq(issueRelations.relatedIssueId, issueId), eq(issueRelations.type, "blocks")))
            .then((rows) => rows.map((row) => row.blockerIssueId));
    }
    async function existingUnresolvedBlockerIssueIds(companyId, issueId) {
        return db
            .select({ blockerIssueId: issueRelations.issueId })
            .from(issueRelations)
            .innerJoin(issues, and(eq(issues.companyId, issueRelations.companyId), eq(issues.id, issueRelations.issueId)))
            .where(and(eq(issueRelations.companyId, companyId), eq(issueRelations.relatedIssueId, issueId), eq(issueRelations.type, "blocks"), notInArray(issues.status, ["done", "cancelled"])))
            .then((rows) => rows.map((row) => row.blockerIssueId));
    }
    async function escalateStrandedAssignedIssue(input) {
        if (isStrandedIssueRecoveryIssue(input.issue)) {
            return escalateStrandedRecoveryIssueInPlace({
                issue: input.issue,
                previousStatus: input.previousStatus,
                latestRun: input.latestRun,
            });
        }
        const recoveryCause = input.recoveryCause ?? "stranded_assigned_issue";
        const recoveryAction = await ensureSourceScopedStrandedRecoveryAction({
            issue: input.issue,
            previousStatus: input.previousStatus,
            latestRun: input.latestRun,
            recoveryCause,
            successfulRunHandoffEvidence: input.successfulRunHandoffEvidence,
        });
        const blockerIds = await existingUnresolvedBlockerIssueIds(input.issue.companyId, input.issue.id);
        const updated = await issuesSvc.update(input.issue.id, {
            status: "blocked",
            blockedByIssueIds: blockerIds,
            assigneeAgentId: recoveryAction.ownerAgentId ?? input.issue.assigneeAgentId,
        });
        if (!updated)
            return null;
        const prefix = await getCompanyIssuePrefix(input.issue.companyId);
        const recoveryOwner = recoveryAction.ownerAgentId ? await getAgent(recoveryAction.ownerAgentId) : null;
        const sourceAssignee = input.issue.assigneeAgentId ? await getAgent(input.issue.assigneeAgentId) : null;
        let notice = null;
        if (input.recoveryCause === SUCCESSFUL_RUN_MISSING_STATE_REASON && input.successfulRunHandoffEvidence) {
            notice = buildSuccessfulRunHandoffExhaustedNotice({
                issue: input.issue,
                sourceRun: input.successfulRunHandoffEvidence.sourceRunId
                    ? { id: input.successfulRunHandoffEvidence.sourceRunId, status: "succeeded" }
                    : null,
                correctiveRun: input.latestRun ? { id: input.latestRun.id, status: input.latestRun.status } : null,
                sourceAssignee,
                recoveryIssue: null,
                recoveryActionId: recoveryAction.id,
                recoveryOwner,
                latestIssueStatus: input.issue.status,
                latestHandoffRunStatus: input.latestRun?.status ?? "unknown",
                missingDisposition: input.successfulRunHandoffEvidence.missingDisposition,
            });
        }
        const recoveryLine = recoveryAction.ownerAgentId
            ? [
                "",
                `- Recovery action: \`${recoveryAction.id}\``,
                `- Recovery owner: ${agentUiLink(recoveryOwner, prefix)}`,
                "- Next action: the recovery owner should either restore a live execution path or record the manual resolution on the source issue.",
            ].join("\n")
            : [
                "",
                `- Recovery action: \`${recoveryAction.id}\``,
                "- Recovery owner: board escalation, because Paperclip could not find an invokable manager, creator, or executive owner with budget available.",
                "- Next action: a board operator should assign an invokable recovery owner, fix the agent/runtime state, or record an intentional manual resolution.",
            ].join("\n");
        if (recoveryAction.attemptCount === 1) {
            const escalationCommentMarker = `Recovery action: \`${recoveryAction.id}\``;
            const hasEscalationComment = await db
                .select({ id: issueComments.id, body: issueComments.body, metadata: issueComments.metadata })
                .from(issueComments)
                .where(and(eq(issueComments.issueId, input.issue.id), eq(issueComments.authorType, "system")))
                .orderBy(desc(issueComments.createdAt))
                .limit(50)
                .then((rows) => rows.some((row) => (row.body ?? "").includes(escalationCommentMarker) ||
                noticeMetadataReferencesRecoveryAction(row.metadata, recoveryAction.id)));
            if (!hasEscalationComment) {
                if (notice) {
                    await issuesSvc.addComment(input.issue.id, notice.body, {}, {
                        authorType: "system",
                        presentation: notice.presentation,
                        metadata: notice.metadata,
                    });
                }
                else {
                    await issuesSvc.addComment(input.issue.id, `${input.comment ?? ""}${recoveryLine}`, {}, {
                        authorType: "system",
                    });
                }
            }
        }
        await logActivity(db, {
            companyId: input.issue.companyId,
            actorType: "system",
            actorId: "system",
            agentId: null,
            runId: null,
            action: input.recoveryCause === SUCCESSFUL_RUN_MISSING_STATE_REASON
                ? "issue.successful_run_handoff_escalated"
                : "issue.updated",
            entityType: "issue",
            entityId: input.issue.id,
            details: {
                identifier: input.issue.identifier,
                status: "blocked",
                previousStatus: input.previousStatus,
                source: input.recoveryCause === SUCCESSFUL_RUN_MISSING_STATE_REASON
                    ? "recovery.reconcile_successful_run_handoff_missing_state"
                    : "recovery.reconcile_stranded_assigned_issue",
                recoveryCause: input.recoveryCause ?? "stranded_assigned_issue",
                latestRunId: input.latestRun?.id ?? null,
                latestRunStatus: input.latestRun?.status ?? null,
                latestRunErrorCode: input.latestRun?.errorCode ?? null,
                recoveryActionId: recoveryAction.id,
                recoveryOwnerAgentId: recoveryAction.ownerAgentId,
                previousOwnerAgentId: recoveryAction.previousOwnerAgentId,
                returnOwnerAgentId: recoveryAction.returnOwnerAgentId,
                blockerIssueIds: blockerIds,
            },
        });
        await enqueueSourceScopedStrandedRecoveryWake({
            action: recoveryAction,
            issue: input.issue,
            latestRun: input.latestRun,
            recoveryCause,
        });
        if (recoveryAction.ownerAgentId && recoveryAction.ownerAgentId === input.issue.assigneeAgentId) {
            const [currentIssue] = await db
                .select({
                status: issues.status,
                assigneeAgentId: issues.assigneeAgentId,
            })
                .from(issues)
                .where(eq(issues.id, input.issue.id))
                .limit(1);
            if (currentIssue &&
                (currentIssue.status !== "blocked" ||
                    currentIssue.assigneeAgentId !== recoveryAction.ownerAgentId)) {
                const reblocked = await issuesSvc.update(input.issue.id, {
                    status: "blocked",
                    blockedByIssueIds: blockerIds,
                    assigneeAgentId: recoveryAction.ownerAgentId,
                });
                if (reblocked)
                    return reblocked;
            }
        }
        return updated;
    }
    async function reconcileStrandedAssignedIssues() {
        const candidates = await db
            .select()
            .from(issues)
            .where(and(isNull(issues.assigneeUserId), inArray(issues.status, ["todo", "in_progress"]), sql `${issues.assigneeAgentId} is not null`));
        const result = {
            assignmentDispatched: 0,
            dispatchRequeued: 0,
            continuationRequeued: 0,
            productiveContinuationObserved: 0,
            successfulContinuationObserved: 0,
            orphanBlockersAssigned: 0,
            successfulRunHandoffEscalated: 0,
            escalated: 0,
            skipped: 0,
            issueIds: [],
        };
        for (const issue of candidates) {
            const agentId = issue.assigneeAgentId;
            if (!agentId) {
                result.skipped += 1;
                continue;
            }
            const agent = await getAgent(agentId);
            if (!agent || agent.companyId !== issue.companyId || !isAgentInvokable(agent)) {
                result.skipped += 1;
                continue;
            }
            if (await hasActiveExecutionPath(issue.companyId, issue.id)) {
                result.skipped += 1;
                continue;
            }
            if (await isAutomaticRecoverySuppressedByPauseHold(db, issue.companyId, issue.id, treeControlSvc)) {
                result.skipped += 1;
                continue;
            }
            const latestRun = await getLatestIssueRun(issue.companyId, issue.id);
            if (isStrandedIssueRecoveryIssue(issue) && isUnsuccessfulTerminalIssueRun(latestRun)) {
                const updated = await escalateStrandedRecoveryIssueInPlace({
                    issue,
                    previousStatus: issue.status,
                    latestRun,
                });
                if (updated) {
                    result.escalated += 1;
                    result.issueIds.push(issue.id);
                }
                else {
                    result.skipped += 1;
                }
                continue;
            }
            if (issue.status === "todo") {
                if (!latestRun) {
                    if (await hasQueuedIssueWake(issue.companyId, issue.id)) {
                        result.skipped += 1;
                        continue;
                    }
                    if (await isInvocationBudgetBlocked(issue, agentId)) {
                        result.skipped += 1;
                        continue;
                    }
                    const queued = await enqueueInitialAssignedTodoDispatch(issue, agentId);
                    if (queued) {
                        result.assignmentDispatched += 1;
                        result.issueIds.push(issue.id);
                    }
                    else {
                        result.skipped += 1;
                    }
                    continue;
                }
                if (latestRun.status === "succeeded") {
                    result.skipped += 1;
                    continue;
                }
                if (didAutomaticRecoveryFail(latestRun, "assignment_recovery")) {
                    const failureSummary = summarizeRunFailureForIssueComment(latestRun);
                    const updated = await escalateStrandedAssignedIssue({
                        issue,
                        previousStatus: "todo",
                        latestRun,
                        comment: "Paperclip automatically retried dispatch for this assigned `todo` issue after a lost wake/run, " +
                            `but it still has no live execution path.${failureSummary ?? ""} ` +
                            "Moving it to `blocked` so it is visible for intervention.",
                    });
                    if (updated) {
                        result.escalated += 1;
                        result.issueIds.push(issue.id);
                    }
                    else {
                        result.skipped += 1;
                    }
                    continue;
                }
                if (await isInvocationBudgetBlocked(issue, agentId)) {
                    result.skipped += 1;
                    continue;
                }
                const queued = await enqueueStrandedIssueRecovery({
                    issueId: issue.id,
                    agentId,
                    reason: "issue_assignment_recovery",
                    retryReason: "assignment_recovery",
                    source: "issue.assignment_recovery",
                    retryOfRunId: latestRun.id,
                });
                if (queued) {
                    result.dispatchRequeued += 1;
                    result.issueIds.push(issue.id);
                }
                else {
                    result.skipped += 1;
                }
                continue;
            }
            if (!latestRun && !issue.checkoutRunId && !issue.executionRunId) {
                result.skipped += 1;
                continue;
            }
            const handoffEvidence = isExhaustedSuccessfulRunHandoff(latestRun);
            if (handoffEvidence) {
                if (!handoffEvidence.exhausted) {
                    result.skipped += 1;
                    continue;
                }
                const updated = await escalateStrandedAssignedIssue({
                    issue,
                    previousStatus: "in_progress",
                    latestRun,
                    recoveryCause: SUCCESSFUL_RUN_MISSING_STATE_REASON,
                    successfulRunHandoffEvidence: handoffEvidence,
                });
                if (updated) {
                    result.successfulRunHandoffEscalated += 1;
                    result.issueIds.push(issue.id);
                }
                else {
                    result.skipped += 1;
                }
                continue;
            }
            if (isSuccessfulInProgressContinuationRun(latestRun)) {
                const successfulRun = latestRun;
                if (!isProductiveContinuationRun(successfulRun)) {
                    result.successfulContinuationObserved += 1;
                    result.skipped += 1;
                    continue;
                }
                if (isRepeatedProductiveContinuationRecovery(successfulRun)) {
                    const updated = await escalateStrandedAssignedIssue({
                        issue,
                        previousStatus: "in_progress",
                        latestRun: successfulRun,
                        comment: "Paperclip automatically retried continuation for this assigned `in_progress` issue and the retry " +
                            "made progress, but it still has no live execution path. Moving it to `blocked` so it is visible for intervention.",
                    });
                    if (updated) {
                        result.escalated += 1;
                        result.issueIds.push(issue.id);
                    }
                    else {
                        result.skipped += 1;
                    }
                    continue;
                }
                if (await isInvocationBudgetBlocked(issue, agentId)) {
                    result.skipped += 1;
                    continue;
                }
                const queued = await enqueueStrandedIssueRecovery({
                    issueId: issue.id,
                    agentId,
                    reason: "issue_continuation_needed",
                    retryReason: "issue_continuation_needed",
                    source: "issue.productive_terminal_continuation_recovery",
                    retryOfRunId: successfulRun.id,
                });
                if (queued) {
                    result.continuationRequeued += 1;
                    result.issueIds.push(issue.id);
                }
                else {
                    result.skipped += 1;
                }
                continue;
            }
            if (didAutomaticRecoveryFail(latestRun, "issue_continuation_needed")) {
                const failureSummary = summarizeRunFailureForIssueComment(latestRun);
                const updated = await escalateStrandedAssignedIssue({
                    issue,
                    previousStatus: "in_progress",
                    latestRun,
                    comment: "Paperclip automatically retried continuation for this assigned `in_progress` issue after its live " +
                        `execution disappeared, but it still has no live execution path.${failureSummary ?? ""} ` +
                        "Moving it to `blocked` so it is visible for intervention.",
                });
                if (updated) {
                    result.escalated += 1;
                    result.issueIds.push(issue.id);
                }
                else {
                    result.skipped += 1;
                }
                continue;
            }
            if (await isInvocationBudgetBlocked(issue, agentId)) {
                result.skipped += 1;
                continue;
            }
            const queued = await enqueueStrandedIssueRecovery({
                issueId: issue.id,
                agentId,
                reason: "issue_continuation_needed",
                retryReason: "issue_continuation_needed",
                source: "issue.continuation_recovery",
                retryOfRunId: latestRun?.id ?? issue.checkoutRunId ?? null,
            });
            if (queued) {
                result.continuationRequeued += 1;
                result.issueIds.push(issue.id);
            }
            else {
                result.skipped += 1;
            }
        }
        const orphanBlockerRecovery = await reconcileUnassignedBlockingIssues();
        result.orphanBlockersAssigned = orphanBlockerRecovery.assigned;
        result.skipped += orphanBlockerRecovery.skipped;
        result.issueIds.push(...orphanBlockerRecovery.issueIds);
        return result;
    }
    async function collectIssueGraphLivenessFindings() {
        const issueRowsPromise = Promise.resolve(db
            .select({
            id: issues.id,
            companyId: issues.companyId,
            identifier: issues.identifier,
            title: issues.title,
            status: issues.status,
            projectId: issues.projectId,
            goalId: issues.goalId,
            parentId: issues.parentId,
            assigneeAgentId: issues.assigneeAgentId,
            assigneeUserId: issues.assigneeUserId,
            createdByAgentId: issues.createdByAgentId,
            createdByUserId: issues.createdByUserId,
            executionPolicy: issues.executionPolicy,
            executionState: issues.executionState,
            monitorNextCheckAt: issues.monitorNextCheckAt,
            monitorAttemptCount: issues.monitorAttemptCount,
        })
            .from(issues)
            .where(and(isNull(issues.hiddenAt), notInArray(issues.originKind, [RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation]))));
        const [issueRows, relationRows, agentRows, activeRunRows, activeIssueRunRows, wakeRows, interactionRows, approvalRows, recoveryIssueRows, recoveryActionRows,] = await Promise.all([
            issueRowsPromise,
            db
                .select({
                companyId: issueRelations.companyId,
                blockerIssueId: issueRelations.issueId,
                blockedIssueId: issueRelations.relatedIssueId,
            })
                .from(issueRelations)
                .where(eq(issueRelations.type, "blocks")),
            db
                .select({
                id: agents.id,
                companyId: agents.companyId,
                name: agents.name,
                role: agents.role,
                title: agents.title,
                status: agents.status,
                reportsTo: agents.reportsTo,
            })
                .from(agents),
            db
                .select({
                companyId: heartbeatRuns.companyId,
                agentId: heartbeatRuns.agentId,
                status: heartbeatRuns.status,
                contextSnapshot: heartbeatRuns.contextSnapshot,
            })
                .from(heartbeatRuns)
                .where(inArray(heartbeatRuns.status, [...EXECUTION_PATH_HEARTBEAT_RUN_STATUSES])),
            db
                .select({
                companyId: issues.companyId,
                agentId: heartbeatRuns.agentId,
                status: heartbeatRuns.status,
                issueId: issues.id,
            })
                .from(issues)
                .innerJoin(heartbeatRuns, eq(issues.executionRunId, heartbeatRuns.id))
                .where(and(isNull(issues.hiddenAt), notInArray(issues.originKind, [RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation]), inArray(heartbeatRuns.status, [...EXECUTION_PATH_HEARTBEAT_RUN_STATUSES]))),
            db
                .select({
                companyId: agentWakeupRequests.companyId,
                agentId: agentWakeupRequests.agentId,
                status: agentWakeupRequests.status,
                payload: agentWakeupRequests.payload,
            })
                .from(agentWakeupRequests)
                .where(inArray(agentWakeupRequests.status, ["queued", "deferred_issue_execution"])),
            db
                .select({
                companyId: issueThreadInteractions.companyId,
                issueId: issueThreadInteractions.issueId,
                status: issueThreadInteractions.status,
            })
                .from(issueThreadInteractions)
                .where(eq(issueThreadInteractions.status, "pending")),
            db
                .select({
                companyId: issueApprovals.companyId,
                issueId: issueApprovals.issueId,
                status: approvals.status,
            })
                .from(issueApprovals)
                .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
                .where(inArray(approvals.status, ["pending", "revision_requested"])),
            db
                .select({
                companyId: issues.companyId,
                id: issues.id,
                status: issues.status,
                originKind: issues.originKind,
                originId: issues.originId,
            })
                .from(issues)
                .where(and(isNull(issues.hiddenAt), inArray(issues.originKind, [
                STRANDED_ISSUE_RECOVERY_ORIGIN_KIND,
                RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation,
            ]), notInArray(issues.status, ["done", "cancelled"]))),
            issueRowsPromise.then((rows) => {
                const issueIdsUnderAnalysis = rows.map((row) => row.id);
                return issueIdsUnderAnalysis.length === 0
                    ? []
                    : db
                        .select({
                        companyId: issueRecoveryActions.companyId,
                        issueId: issueRecoveryActions.sourceIssueId,
                        status: issueRecoveryActions.status,
                    })
                        .from(issueRecoveryActions)
                        .where(and(inArray(issueRecoveryActions.status, ["active", "escalated"]), inArray(issueRecoveryActions.sourceIssueId, issueIdsUnderAnalysis)));
            }),
        ]);
        const openRecoveryIssues = recoveryIssueRows.flatMap((row) => {
            if (row.originKind === RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation) {
                const parsed = parseIssueGraphLivenessIncidentKey(row.originId);
                if (!parsed || parsed.companyId !== row.companyId)
                    return [];
                return [
                    {
                        companyId: row.companyId,
                        issueId: parsed.issueId,
                        status: row.status,
                    },
                    {
                        companyId: row.companyId,
                        issueId: parsed.leafIssueId,
                        status: row.status,
                    },
                ];
            }
            const issueId = readNonEmptyString(row.originId);
            if (!issueId)
                return [];
            return [{
                    companyId: row.companyId,
                    issueId,
                    status: row.status,
                }];
        });
        return classifyIssueGraphLiveness({
            issues: issueRows,
            relations: relationRows,
            agents: agentRows,
            activeRuns: activeRunRows.map((row) => ({
                companyId: row.companyId,
                agentId: row.agentId,
                status: row.status,
                issueId: issueIdFromRunContext(row.contextSnapshot),
            })).concat(activeIssueRunRows.map((row) => ({
                companyId: row.companyId,
                agentId: row.agentId,
                status: row.status,
                issueId: row.issueId,
            }))),
            queuedWakeRequests: wakeRows.map((row) => ({
                companyId: row.companyId,
                agentId: row.agentId,
                status: row.status,
                issueId: issueIdFromWakePayload(row.payload),
            })),
            pendingInteractions: interactionRows,
            pendingApprovals: approvalRows,
            openRecoveryIssues: openRecoveryIssues.concat(recoveryActionRows),
            now: new Date(),
        });
    }
    async function findOpenLivenessEscalation(companyId, incidentKey) {
        return db
            .select()
            .from(issues)
            .where(and(eq(issues.companyId, companyId), eq(issues.originKind, RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation), eq(issues.originId, incidentKey), isNull(issues.hiddenAt), notInArray(issues.status, ["done", "cancelled"])))
            .limit(1)
            .then((rows) => rows[0] ?? null);
    }
    async function findOpenLivenessRecoveryIssueForLeaf(finding) {
        const byFingerprint = await db
            .select()
            .from(issues)
            .where(and(eq(issues.companyId, finding.companyId), eq(issues.originKind, RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation), eq(issues.originFingerprint, livenessRecoveryLeafFingerprint(finding)), isNull(issues.hiddenAt), notInArray(issues.status, ["done", "cancelled"])))
            .limit(1)
            .then((rows) => rows[0] ?? null);
        if (byFingerprint)
            return byFingerprint;
        const leafIssueId = livenessRecoveryLeafIssueId(finding);
        const openRecoveries = await db
            .select()
            .from(issues)
            .where(and(eq(issues.companyId, finding.companyId), eq(issues.originKind, RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation), isNull(issues.hiddenAt), notInArray(issues.status, ["done", "cancelled"])));
        return openRecoveries.find((row) => {
            const parsed = parseLivenessIncidentKey(row.originId);
            return parsed?.state === finding.state && parsed.leafIssueId === leafIssueId;
        }) ?? null;
    }
    async function removeRecoveryBlockerFromSource(recovery) {
        const parsed = parseLivenessIncidentKey(recovery.originId);
        if (!parsed)
            return false;
        const sourceIssue = await db
            .select()
            .from(issues)
            .where(and(eq(issues.companyId, recovery.companyId), eq(issues.id, parsed.issueId)))
            .then((rows) => rows[0] ?? null);
        if (!sourceIssue)
            return false;
        const blockerIds = await existingBlockerIssueIds(sourceIssue.companyId, sourceIssue.id);
        if (!blockerIds.includes(recovery.id))
            return false;
        await issuesSvc.update(sourceIssue.id, {
            blockedByIssueIds: blockerIds.filter((blockerId) => blockerId !== recovery.id),
        });
        return true;
    }
    async function hasActiveRunForIssueId(companyId, issueId) {
        const [contextRun, issueRun] = await Promise.all([
            db
                .select({ id: heartbeatRuns.id })
                .from(heartbeatRuns)
                .where(and(eq(heartbeatRuns.companyId, companyId), inArray(heartbeatRuns.status, [...EXECUTION_PATH_HEARTBEAT_RUN_STATUSES]), sql `(${heartbeatRuns.contextSnapshot}->>'issueId' = ${issueId}
              OR ${heartbeatRuns.contextSnapshot}->>'taskId' = ${issueId})`))
                .limit(1)
                .then((rows) => rows[0] ?? null),
            db
                .select({ id: heartbeatRuns.id })
                .from(issues)
                .innerJoin(heartbeatRuns, eq(issues.executionRunId, heartbeatRuns.id))
                .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId), inArray(heartbeatRuns.status, [...EXECUTION_PATH_HEARTBEAT_RUN_STATUSES])))
                .limit(1)
                .then((rows) => rows[0] ?? null),
        ]);
        return Boolean(contextRun || issueRun);
    }
    async function retireObsoleteLivenessRecoveryIssues(findings) {
        const currentIncidentKeys = new Set(findings.map((finding) => finding.incidentKey));
        const currentLeafKeys = new Set(findings.map((finding) => livenessRecoveryLeafKey(finding.companyId, finding.state, livenessRecoveryLeafIssueId(finding))));
        const openRecoveries = await db
            .select()
            .from(issues)
            .where(and(eq(issues.originKind, RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation), isNull(issues.hiddenAt), notInArray(issues.status, ["done", "cancelled"])));
        const result = {
            retired: 0,
            activeSkipped: 0,
            blockerRelationsRemoved: 0,
            retiredIssueIds: [],
        };
        for (const recovery of openRecoveries) {
            if (recovery.originId && currentIncidentKeys.has(recovery.originId))
                continue;
            const parsed = parseLivenessIncidentKey(recovery.originId);
            if (!parsed)
                continue;
            if (currentLeafKeys.has(livenessRecoveryLeafKey(parsed.companyId, parsed.state, parsed.leafIssueId))) {
                continue;
            }
            const sourceIssue = await db
                .select({
                id: issues.id,
                status: issues.status,
            })
                .from(issues)
                .where(and(eq(issues.companyId, parsed.companyId), eq(issues.id, parsed.issueId)))
                .then((rows) => rows[0] ?? null);
            if (sourceIssue && !["done", "cancelled"].includes(sourceIssue.status)) {
                const blockerIds = await existingBlockerIssueIds(parsed.companyId, sourceIssue.id);
                if (blockerIds.includes(recovery.id)) {
                    result.activeSkipped += 1;
                    continue;
                }
            }
            if (await removeRecoveryBlockerFromSource(recovery)) {
                result.blockerRelationsRemoved += 1;
            }
            if (await hasActiveRunForIssueId(recovery.companyId, recovery.id)) {
                result.activeSkipped += 1;
                continue;
            }
            await issuesSvc.update(recovery.id, { status: "cancelled" });
            result.retired += 1;
            result.retiredIssueIds.push(recovery.id);
        }
        return result;
    }
    function normalizeIssueGraphLivenessAutoRecoveryLookbackHours(raw) {
        const numeric = Math.floor(asNumber(raw, DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS));
        return Math.min(MAX_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS, Math.max(MIN_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS, numeric));
    }
    function livenessDependencyIssueKey(companyId, issueId) {
        return `${companyId}:${issueId}`;
    }
    async function loadLivenessDependencyUpdatedAtByIssue(findings) {
        const issueIds = [
            ...new Set(findings.flatMap((finding) => finding.dependencyPath.map((entry) => entry.issueId))),
        ];
        if (issueIds.length === 0)
            return new Map();
        const rows = await db
            .select({ id: issues.id, companyId: issues.companyId, updatedAt: issues.updatedAt })
            .from(issues)
            .where(inArray(issues.id, issueIds));
        return new Map(rows.map((row) => [
            livenessDependencyIssueKey(row.companyId, row.id),
            row.updatedAt,
        ]));
    }
    function latestDependencyUpdatedAtForLivenessFinding(finding, updatedAtByIssueKey) {
        const dependencyIssueIds = [...new Set(finding.dependencyPath.map((entry) => entry.issueId))];
        if (dependencyIssueIds.length === 0)
            return null;
        const timestamps = dependencyIssueIds.map((issueId) => updatedAtByIssueKey.get(livenessDependencyIssueKey(finding.companyId, issueId)) ?? null);
        if (timestamps.some((timestamp) => !timestamp))
            return null;
        const [firstTimestamp, ...remainingTimestamps] = timestamps;
        return remainingTimestamps.reduce((latest, updatedAt) => updatedAt > latest ? updatedAt : latest, firstTimestamp);
    }
    function isLivenessFindingInsideAutoRecoveryLookback(finding, cutoff, updatedAtByIssueKey) {
        const latestUpdatedAt = latestDependencyUpdatedAtForLivenessFinding(finding, updatedAtByIssueKey);
        return Boolean(latestUpdatedAt && latestUpdatedAt >= cutoff);
    }
    async function buildIssueGraphLivenessAutoRecoveryPreview(opts) {
        const now = opts?.now ?? new Date();
        const lookbackHours = normalizeIssueGraphLivenessAutoRecoveryLookbackHours(opts?.lookbackHours);
        const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
        const findings = await collectIssueGraphLivenessFindings();
        const updatedAtByIssueKey = await loadLivenessDependencyUpdatedAtByIssue(findings);
        const issueIds = [...new Set(findings.map((finding) => finding.recoveryIssueId))];
        const recoveryRows = issueIds.length > 0
            ? await db
                .select({ id: issues.id, identifier: issues.identifier, title: issues.title })
                .from(issues)
                .where(inArray(issues.id, issueIds))
            : [];
        const recoveryById = new Map(recoveryRows.map((row) => [row.id, row]));
        const items = [];
        let skippedOutsideLookback = 0;
        for (const finding of findings) {
            const latestDependencyUpdatedAt = latestDependencyUpdatedAtForLivenessFinding(finding, updatedAtByIssueKey);
            if (!latestDependencyUpdatedAt || latestDependencyUpdatedAt < cutoff) {
                skippedOutsideLookback += 1;
                continue;
            }
            const recoveryIssue = recoveryById.get(finding.recoveryIssueId);
            items.push({
                issueId: finding.issueId,
                identifier: finding.identifier,
                title: finding.dependencyPath[0]?.title ?? finding.identifier ?? finding.issueId,
                state: finding.state,
                severity: finding.severity,
                reason: finding.reason,
                recoveryIssueId: finding.recoveryIssueId,
                recoveryIdentifier: recoveryIssue?.identifier ?? null,
                recoveryTitle: recoveryIssue?.title ?? null,
                recommendedOwnerAgentId: finding.recommendedOwnerAgentId,
                incidentKey: finding.incidentKey,
                latestDependencyUpdatedAt: latestDependencyUpdatedAt.toISOString(),
                dependencyPath: finding.dependencyPath,
            });
        }
        return {
            lookbackHours,
            cutoff: cutoff.toISOString(),
            generatedAt: now.toISOString(),
            findings: findings.length,
            recoverableFindings: items.length,
            skippedOutsideLookback,
            items,
        };
    }
    async function resolveEscalationOwnerAgentId(finding, issue) {
        const detailedCandidates = finding.recommendedOwnerCandidates.length > 0
            ? finding.recommendedOwnerCandidates
            : finding.recommendedOwnerCandidateAgentIds.map((agentId) => ({
                agentId,
                reason: "ordered_invokable_fallback",
                sourceIssueId: finding.recoveryIssueId,
            }));
        const seenCandidates = new Set();
        const candidates = detailedCandidates.filter((candidate) => {
            if (seenCandidates.has(candidate.agentId))
                return false;
            seenCandidates.add(candidate.agentId);
            return true;
        });
        const budgetBlockedCandidateAgentIds = [];
        for (const candidate of candidates) {
            const budgetBlock = await budgets.getInvocationBlock(issue.companyId, candidate.agentId, {
                issueId: issue.id,
                projectId: issue.projectId,
            });
            if (!budgetBlock) {
                return {
                    agentId: candidate.agentId,
                    reason: candidate.reason,
                    sourceIssueId: candidate.sourceIssueId,
                    candidateAgentIds: candidates.map((entry) => entry.agentId),
                    candidateReasons: candidates.map((entry) => ({
                        agentId: entry.agentId,
                        reason: entry.reason,
                        sourceIssueId: entry.sourceIssueId,
                    })),
                    budgetBlockedCandidateAgentIds,
                };
            }
            budgetBlockedCandidateAgentIds.push(candidate.agentId);
        }
        return null;
    }
    function shouldReuseRecoveryExecutionWorkspace(input) {
        if (input.finding.recoveryIssueId === input.finding.issueId)
            return false;
        return input.recoveryIssue.assigneeAgentId === input.ownerAgentId;
    }
    async function ensureIssueBlockedByEscalation(input) {
        const blockerIds = await existingBlockerIssueIds(input.issue.companyId, input.issue.id);
        const nextBlockerIds = [...new Set([...blockerIds, input.escalationIssueId])];
        const isAlreadyBlockedByEscalation = blockerIds.includes(input.escalationIssueId);
        const isAlreadyBlocked = input.issue.status === "blocked";
        if (isAlreadyBlockedByEscalation && isAlreadyBlocked) {
            return input.issue;
        }
        const update = {
            blockedByIssueIds: nextBlockerIds,
        };
        if (!isAlreadyBlocked) {
            update.status = "blocked";
        }
        const updated = await issuesSvc.update(input.issue.id, update);
        if (!updated)
            return null;
        await logActivity(db, {
            companyId: input.issue.companyId,
            actorType: "system",
            actorId: "system",
            agentId: null,
            runId: input.runId ?? null,
            action: "issue.blockers.updated",
            entityType: "issue",
            entityId: input.issue.id,
            details: {
                source: "recovery.reconcile_issue_graph_liveness",
                incidentKey: input.finding.incidentKey,
                findingState: input.finding.state,
                blockerIssueIds: nextBlockerIds,
                escalationIssueId: input.escalationIssueId,
                status: update.status ?? input.issue.status,
                previousStatus: input.issue.status,
            },
        });
        return updated;
    }
    async function createIssueGraphLivenessEscalation(input) {
        const issue = await db
            .select()
            .from(issues)
            .where(eq(issues.id, input.finding.issueId))
            .then((rows) => rows[0] ?? null);
        if (!issue || issue.companyId !== input.finding.companyId)
            return { kind: "skipped" };
        if (await isAutomaticRecoverySuppressedByPauseHold(db, issue.companyId, issue.id, treeControlSvc)) {
            return { kind: "skipped" };
        }
        const recoveryIssue = await db
            .select()
            .from(issues)
            .where(and(eq(issues.id, input.finding.recoveryIssueId), eq(issues.companyId, issue.companyId)))
            .then((rows) => rows[0] ?? null);
        if (!recoveryIssue)
            return { kind: "skipped" };
        const existing = await findOpenLivenessEscalation(issue.companyId, input.finding.incidentKey) ??
            await findOpenLivenessRecoveryIssueForLeaf(input.finding);
        if (existing) {
            await ensureIssueBlockedByEscalation({
                issue,
                escalationIssueId: existing.id,
                finding: input.finding,
                runId: input.runId ?? null,
            });
            return { kind: "existing", escalationIssueId: existing.id };
        }
        const ownerSelection = await resolveEscalationOwnerAgentId(input.finding, recoveryIssue);
        if (!ownerSelection)
            return { kind: "skipped" };
        const reuseRecoveryExecutionWorkspace = shouldReuseRecoveryExecutionWorkspace({
            finding: input.finding,
            recoveryIssue,
            ownerAgentId: ownerSelection.agentId,
        });
        let escalation;
        try {
            escalation = await issuesSvc.create(issue.companyId, {
                title: `Unblock liveness incident for ${recoveryIssue.identifier ?? recoveryIssue.title}`,
                description: buildLivenessEscalationDescription(input.finding),
                status: "todo",
                priority: "high",
                parentId: recoveryIssue.id,
                projectId: recoveryIssue.projectId,
                goalId: recoveryIssue.goalId,
                assigneeAgentId: ownerSelection.agentId,
                assigneeAdapterOverrides: recoveryAssigneeAdapterOverrides(),
                originKind: RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation,
                originId: input.finding.incidentKey,
                originFingerprint: livenessRecoveryLeafFingerprint(input.finding),
                billingCode: recoveryIssue.billingCode,
                ...(reuseRecoveryExecutionWorkspace
                    ? { inheritExecutionWorkspaceFromIssueId: recoveryIssue.id }
                    : {
                        executionWorkspaceId: null,
                        executionWorkspacePreference: null,
                        executionWorkspaceSettings: null,
                    }),
            });
        }
        catch (error) {
            if (!isUniqueLivenessRecoveryConflict(error))
                throw error;
            const raced = await findOpenLivenessEscalation(issue.companyId, input.finding.incidentKey) ??
                await findOpenLivenessRecoveryIssueForLeaf(input.finding);
            if (!raced)
                throw error;
            await ensureIssueBlockedByEscalation({
                issue,
                escalationIssueId: raced.id,
                finding: input.finding,
                runId: input.runId ?? null,
            });
            return { kind: "existing", escalationIssueId: raced.id };
        }
        await ensureIssueBlockedByEscalation({
            issue,
            escalationIssueId: escalation.id,
            finding: input.finding,
            runId: input.runId ?? null,
        });
        await issuesSvc.addComment(issue.id, buildLivenessOriginalIssueComment(input.finding, escalation), { runId: input.runId ?? null });
        await logActivity(db, {
            companyId: issue.companyId,
            actorType: "system",
            actorId: "system",
            agentId: ownerSelection.agentId,
            runId: input.runId ?? null,
            action: "issue.harness_liveness_escalation_created",
            entityType: "issue",
            entityId: escalation.id,
            details: {
                source: "recovery.reconcile_issue_graph_liveness",
                incidentKey: input.finding.incidentKey,
                findingState: input.finding.state,
                sourceIssueId: issue.id,
                sourceIdentifier: issue.identifier,
                recoveryIssueId: recoveryIssue.id,
                recoveryIdentifier: recoveryIssue.identifier,
                escalationIssueId: escalation.id,
                escalationIdentifier: escalation.identifier,
                dependencyPath: input.finding.dependencyPath,
                ownerSelection: {
                    selectedAgentId: ownerSelection.agentId,
                    selectedReason: ownerSelection.reason,
                    selectedSourceIssueId: ownerSelection.sourceIssueId,
                    candidateAgentIds: ownerSelection.candidateAgentIds,
                    candidateReasons: ownerSelection.candidateReasons,
                    budgetBlockedCandidateAgentIds: ownerSelection.budgetBlockedCandidateAgentIds,
                },
                workspaceSelection: {
                    reuseRecoveryExecutionWorkspace,
                    inheritedExecutionWorkspaceFromIssueId: reuseRecoveryExecutionWorkspace ? recoveryIssue.id : null,
                    projectWorkspaceSourceIssueId: recoveryIssue.id,
                },
            },
        });
        const wake = await deps.enqueueWakeup(ownerSelection.agentId, {
            source: "assignment",
            triggerDetail: "system",
            reason: "issue_assigned",
            payload: withRecoveryModelProfileHint({
                issueId: escalation.id,
                sourceIssueId: issue.id,
                recoveryIssueId: recoveryIssue.id,
                incidentKey: input.finding.incidentKey,
            }),
            requestedByActorType: "system",
            requestedByActorId: null,
            contextSnapshot: withRecoveryModelProfileHint({
                issueId: escalation.id,
                taskId: escalation.id,
                wakeReason: "issue_assigned",
                source: RECOVERY_ORIGIN_KINDS.issueGraphLivenessEscalation,
                sourceIssueId: issue.id,
                recoveryIssueId: recoveryIssue.id,
                incidentKey: input.finding.incidentKey,
            }),
        });
        logger.warn({
            incidentKey: input.finding.incidentKey,
            findingState: input.finding.state,
            sourceIssueId: issue.id,
            recoveryIssueId: recoveryIssue.id,
            escalationIssueId: escalation.id,
            ownerAgentId: ownerSelection.agentId,
            ownerSelectionReason: ownerSelection.reason,
            wakeupRunId: wake?.id ?? null,
        }, "created issue graph liveness escalation");
        return { kind: "created", escalationIssueId: escalation.id };
    }
    async function reconcileIssueGraphLiveness(opts) {
        const findings = await collectIssueGraphLivenessFindings();
        const experimentalSettings = await instanceSettings.getExperimental();
        const autoRecoveryEnabled = asBoolean(experimentalSettings.enableIssueGraphLivenessAutoRecovery, true) || opts?.force === true;
        const lookbackHours = normalizeIssueGraphLivenessAutoRecoveryLookbackHours(opts?.lookbackHours ?? experimentalSettings.issueGraphLivenessAutoRecoveryLookbackHours);
        const now = new Date();
        const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
        const obsoleteRecoveryCleanup = await retireObsoleteLivenessRecoveryIssues(findings);
        const updatedAtByIssueKey = await loadLivenessDependencyUpdatedAtByIssue(findings);
        const result = {
            findings: findings.length,
            autoRecoveryEnabled,
            lookbackHours,
            cutoff: cutoff.toISOString(),
            escalationsCreated: 0,
            existingEscalations: 0,
            skipped: 0,
            skippedAutoRecoveryDisabled: 0,
            skippedOutsideLookback: 0,
            obsoleteRecoveriesRetired: obsoleteRecoveryCleanup.retired,
            obsoleteRecoveriesActiveSkipped: obsoleteRecoveryCleanup.activeSkipped,
            obsoleteRecoveryBlockerRelationsRemoved: obsoleteRecoveryCleanup.blockerRelationsRemoved,
            issueIds: [],
            escalationIssueIds: [],
            retiredRecoveryIssueIds: obsoleteRecoveryCleanup.retiredIssueIds,
        };
        if (!autoRecoveryEnabled) {
            result.skippedAutoRecoveryDisabled = findings.length;
            return result;
        }
        for (const finding of findings) {
            if (!isLivenessFindingInsideAutoRecoveryLookback(finding, cutoff, updatedAtByIssueKey)) {
                result.skippedOutsideLookback += 1;
                result.skipped += 1;
                continue;
            }
            const escalation = await createIssueGraphLivenessEscalation({
                finding,
                runId: opts?.runId ?? null,
            });
            if (escalation.kind === "created") {
                result.escalationsCreated += 1;
                result.issueIds.push(finding.issueId);
                result.escalationIssueIds.push(escalation.escalationIssueId);
            }
            else if (escalation.kind === "existing") {
                result.existingEscalations += 1;
                result.issueIds.push(finding.issueId);
                result.escalationIssueIds.push(escalation.escalationIssueId);
            }
            else {
                result.skipped += 1;
            }
        }
        return result;
    }
    function readRecoveryTimerIntervalMs(raw, fallback) {
        return Math.max(1, Math.floor(asNumber(raw, fallback)));
    }
    return {
        buildRunOutputSilence,
        escalateStrandedRecoveryIssueInPlace,
        escalateStrandedAssignedIssue,
        recordWatchdogDecision,
        scanSilentActiveRuns,
        reconcileStrandedAssignedIssues,
        buildIssueGraphLivenessAutoRecoveryPreview,
        reconcileIssueGraphLiveness,
        readRecoveryTimerIntervalMs,
    };
}
//# sourceMappingURL=service.js.map