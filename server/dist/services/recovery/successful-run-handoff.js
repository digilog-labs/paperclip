import { and, eq, inArray } from "drizzle-orm";
import { agentWakeupRequests } from "@paperclipai/db";
import { withRecoveryModelProfileHint } from "./model-profile-hint.js";
export const FINISH_SUCCESSFUL_RUN_HANDOFF_REASON = "finish_successful_run_handoff";
export const SUCCESSFUL_RUN_MISSING_STATE_REASON = "successful_run_missing_state";
export const DEFAULT_MAX_SUCCESSFUL_RUN_HANDOFF_ATTEMPTS = 1;
export const SUCCESSFUL_RUN_HANDOFF_REQUIRED_NOTICE_BODY = "Paperclip needs a disposition before this issue can continue.";
export const SUCCESSFUL_RUN_HANDOFF_EXHAUSTED_NOTICE_BODY = "Paperclip could not resolve this issue's missing disposition automatically. The issue is blocked on a recovery owner.";
export const LEGACY_SUCCESSFUL_RUN_HANDOFF_NOTICE_PREFIXES = [
    "## This issue still needs a next step",
    "## Successful run missing issue disposition",
];
export const SUCCESSFUL_RUN_HANDOFF_OPTIONS = [
    "mark_done_or_cancelled",
    "send_for_review_or_ask_for_input",
    "mark_blocked",
    "delegate_or_continue_from_checkpoint",
];
const PRODUCTIVE_SUCCESS_LIVENESS_STATES = new Set([
    "advanced",
    "completed",
    "blocked",
    "needs_followup",
]);
const IDEMPOTENT_HANDOFF_WAKE_STATUSES = [
    "queued",
    "deferred_issue_execution",
    "claimed",
    "completed",
];
const IDEMPOTENT_HANDOFF_WAKE_STATUS_SET = new Set(IDEMPOTENT_HANDOFF_WAKE_STATUSES);
export function isIdempotentFinishSuccessfulRunHandoffWakeStatus(status) {
    return IDEMPOTENT_HANDOFF_WAKE_STATUS_SET.has(status);
}
export function noticeMetadataReferencesRecoveryAction(metadata, recoveryActionId) {
    return (metadata?.sections ?? []).some((section) => section.rows.some((row) => row.type === "key_value" &&
        row.label === "Recovery action" &&
        row.value === recoveryActionId));
}
function metadataText(value, fallback = "unknown") {
    const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    const resolved = text.length > 0 ? text : fallback;
    return resolved.length > 2000 ? `${resolved.slice(0, 1997)}...` : resolved;
}
function keyValueRow(label, value) {
    return { type: "key_value", label, value: metadataText(value) };
}
function issueLinkRow(label, issue) {
    if (!issue)
        return keyValueRow(label, "unknown");
    return {
        type: "issue_link",
        label,
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
    };
}
function runLinkRow(label, run) {
    if (!run)
        return keyValueRow(label, "unknown");
    return { type: "run_link", label, runId: run.id, title: run.status };
}
function agentLinkRow(label, agent) {
    if (!agent)
        return keyValueRow(label, "unknown");
    return { type: "agent_link", label, agentId: agent.id, name: agent.name };
}
function systemNoticePresentation(input) {
    return {
        kind: "system_notice",
        tone: input.tone,
        title: input.title,
        detailsDefaultOpen: false,
    };
}
export function isSuccessfulRunHandoffRequiredNoticeBody(body) {
    const trimmed = body.trim();
    return trimmed === SUCCESSFUL_RUN_HANDOFF_REQUIRED_NOTICE_BODY ||
        LEGACY_SUCCESSFUL_RUN_HANDOFF_NOTICE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
export function buildSuccessfulRunHandoffRequiredNotice(input) {
    return {
        body: SUCCESSFUL_RUN_HANDOFF_REQUIRED_NOTICE_BODY,
        presentation: systemNoticePresentation({
            tone: "warning",
            title: "Missing issue disposition",
        }),
        metadata: {
            version: 1,
            sourceRunId: input.run.id,
            sections: [
                {
                    title: "Required action",
                    rows: [
                        issueLinkRow("Source issue", input.issue),
                        agentLinkRow("Assignee", input.agent),
                        keyValueRow("Missing disposition", "clear_next_step"),
                        keyValueRow("Valid dispositions", "done, cancelled, in_review with an owner, blocked with blockers, delegated follow-up, or explicit continuation"),
                    ],
                },
                {
                    title: "Run evidence",
                    rows: [
                        runLinkRow("Successful run", input.run),
                        keyValueRow("Run status", input.run.status),
                        keyValueRow("Normalized cause", SUCCESSFUL_RUN_MISSING_STATE_REASON),
                        keyValueRow("Detected progress", input.detectedProgressSummary),
                        keyValueRow("Automatic retry", "one corrective handoff wake queued"),
                    ],
                },
            ],
        },
    };
}
export function buildSuccessfulRunHandoffExhaustedNotice(input) {
    return {
        body: SUCCESSFUL_RUN_HANDOFF_EXHAUSTED_NOTICE_BODY,
        presentation: systemNoticePresentation({
            tone: "danger",
            title: "Missing disposition recovery blocked",
        }),
        metadata: {
            version: 1,
            sourceRunId: input.sourceRun?.id ?? null,
            sections: [
                {
                    title: "Recovery owner",
                    rows: [
                        issueLinkRow("Source issue", input.issue),
                        input.recoveryActionId
                            ? keyValueRow("Recovery action", input.recoveryActionId)
                            : issueLinkRow("Recovery issue", input.recoveryIssue),
                        agentLinkRow("Recovery owner", input.recoveryOwner),
                        agentLinkRow("Source assignee", input.sourceAssignee),
                        keyValueRow("Suggested action", "choose and record a valid issue disposition without copying transcript content"),
                    ],
                },
                {
                    title: "Run evidence",
                    rows: [
                        runLinkRow("Source run", input.sourceRun),
                        runLinkRow("Corrective handoff run", input.correctiveRun),
                        keyValueRow("Latest issue status", input.latestIssueStatus),
                        keyValueRow("Latest handoff run status", input.latestHandoffRunStatus),
                        keyValueRow("Normalized cause", SUCCESSFUL_RUN_MISSING_STATE_REASON),
                        keyValueRow("Missing disposition", input.missingDisposition),
                    ],
                },
            ],
        },
    };
}
export function buildFinishSuccessfulRunHandoffIdempotencyKey(input) {
    return [
        FINISH_SUCCESSFUL_RUN_HANDOFF_REASON,
        input.issueId,
        input.sourceRunId,
        String(input.attempt ?? 1),
    ].join(":");
}
export async function findExistingFinishSuccessfulRunHandoffWake(db, input) {
    return db
        .select({ id: agentWakeupRequests.id, status: agentWakeupRequests.status })
        .from(agentWakeupRequests)
        .where(and(eq(agentWakeupRequests.companyId, input.companyId), eq(agentWakeupRequests.idempotencyKey, input.idempotencyKey), inArray(agentWakeupRequests.status, IDEMPOTENT_HANDOFF_WAKE_STATUSES)))
        .limit(1)
        .then((rows) => rows[0] ?? null);
}
function readRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function readString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function isCorrectiveHandoffRun(run) {
    const context = readRecord(run.contextSnapshot);
    return context.handoffRequired === true ||
        readString(context.wakeReason) === FINISH_SUCCESSFUL_RUN_HANDOFF_REASON;
}
function isIssueMonitorMaintenanceRun(run) {
    const context = readRecord(run.contextSnapshot);
    const wakeReason = readString(context.wakeReason);
    const source = readString(context.source);
    return Boolean(wakeReason?.startsWith("issue_monitor") || source?.startsWith("issue.monitor"));
}
function isProductiveSuccessfulRun(input) {
    if (input.livenessState && PRODUCTIVE_SUCCESS_LIVENESS_STATES.has(input.livenessState))
        return true;
    return Boolean(input.detectedProgressSummary);
}
export function buildSuccessfulRunHandoffInstruction(input) {
    const issueLabel = input.issueIdentifier ?? "this issue";
    return [
        `Your previous run on ${issueLabel} succeeded, but the issue is still in \`in_progress\` and Paperclip cannot identify a valid issue disposition.`,
        "",
        "Resolve the missing disposition before creating or revising any new artifacts. Choose **exactly one** outcome and perform the matching Paperclip action:",
        "",
        "**Is the issue finished?**",
        "1. Mark it `done` (scope complete) or `cancelled` (intentionally stopped).",
        "",
        "**Does someone else need to look at it?**",
        "2. Move it to `in_review` with a real reviewer path — `executionState.currentParticipant`, a human owner via `assigneeUserId`, a pending issue-thread interaction, or a linked pending approval.",
        "",
        "**Can it not continue right now?**",
        "3. Mark it `blocked` with first-class blockers (`blockedByIssueIds`) or a clearly named unblock owner/action.",
        "",
        "**Is there more work to do?**",
        `4. Either delegate follow-up work (create/link a follow-up issue and block this one on it, or close this issue if its scope is independently complete) or record an explicit continuation path with \`resumeIntent: true\`, \`resumeFromRunId: ${input.sourceRunId}\`, and a concrete next action.`,
        "",
        "Comments, document revisions, work-product writes, and continuation summaries are supporting evidence only — they do not satisfy this handoff unless the issue state/path also records one valid disposition.",
    ].join("\n");
}
export function decideSuccessfulRunHandoff(input) {
    const { run, issue, agent } = input;
    if (run.status !== "succeeded")
        return { kind: "skip", reason: "source run did not succeed" };
    if (isCorrectiveHandoffRun(run))
        return { kind: "skip", reason: "source run is already a corrective handoff run" };
    if (isIssueMonitorMaintenanceRun(run))
        return { kind: "skip", reason: "issue monitor run owns its own recovery path" };
    if (run.issueCommentStatus === "retry_queued" || run.issueCommentStatus === "retry_exhausted") {
        return { kind: "skip", reason: "missing issue comment retry owns the next action" };
    }
    if (!issue)
        return { kind: "skip", reason: "issue not found" };
    if (!agent)
        return { kind: "skip", reason: "agent not found" };
    if (issue.companyId !== run.companyId || agent.companyId !== run.companyId) {
        return { kind: "skip", reason: "company scope mismatch" };
    }
    if (issue.assigneeAgentId !== run.agentId) {
        return { kind: "skip", reason: "issue is no longer assigned to the source run agent" };
    }
    if (issue.assigneeUserId)
        return { kind: "skip", reason: "issue is human-owned" };
    if (issue.status !== "in_progress")
        return { kind: "skip", reason: `issue status ${issue.status} is a valid disposition` };
    if (issue.executionState)
        return { kind: "skip", reason: "issue has execution policy state" };
    if (agent.status === "paused" || agent.status === "terminated" || agent.status === "pending_approval") {
        return { kind: "skip", reason: `agent status ${agent.status} is not invokable` };
    }
    if (!isProductiveSuccessfulRun(input)) {
        return { kind: "skip", reason: "successful run did not produce handoff-relevant progress" };
    }
    if (input.hasActiveExecutionPath)
        return { kind: "skip", reason: "issue already has an active execution path" };
    if (input.hasQueuedWake)
        return { kind: "skip", reason: "issue already has a queued or deferred wake" };
    if (input.hasPendingInteractionOrApproval) {
        return { kind: "skip", reason: "pending interaction or approval owns the next action" };
    }
    if (input.hasExplicitBlockerPath)
        return { kind: "skip", reason: "explicit blocker path owns the next action" };
    if (input.hasOpenRecoveryIssue)
        return { kind: "skip", reason: "open recovery issue owns the ambiguity" };
    if (input.hasPauseHold)
        return { kind: "skip", reason: "issue is under an active pause hold" };
    if (input.budgetBlocked)
        return { kind: "skip", reason: "budget hard stop blocks corrective wake" };
    if (input.idempotentWakeExists) {
        return { kind: "skip", reason: "corrective handoff wake already exists for this source run" };
    }
    const instruction = buildSuccessfulRunHandoffInstruction({
        issueIdentifier: issue.identifier,
        sourceRunId: run.id,
    });
    const payload = withRecoveryModelProfileHint({
        issueId: issue.id,
        taskId: issue.id,
        sourceIssueId: issue.id,
        sourceRunId: run.id,
        handoffRequired: true,
        handoffReason: SUCCESSFUL_RUN_MISSING_STATE_REASON,
        missingDisposition: "clear_next_step",
        validDispositionOptions: [...SUCCESSFUL_RUN_HANDOFF_OPTIONS],
        detectedProgressSummary: input.detectedProgressSummary,
        handoffAttempt: 1,
        maxHandoffAttempts: DEFAULT_MAX_SUCCESSFUL_RUN_HANDOFF_ATTEMPTS,
        resumeIntent: true,
        followUpRequested: true,
        resumeFromRunId: run.id,
        ...(input.taskKey ? { taskKey: input.taskKey } : {}),
        instruction,
    });
    return {
        kind: "enqueue",
        idempotencyKey: buildFinishSuccessfulRunHandoffIdempotencyKey({
            issueId: issue.id,
            sourceRunId: run.id,
        }),
        payload,
        instruction,
        contextSnapshot: withRecoveryModelProfileHint({
            ...payload,
            wakeReason: FINISH_SUCCESSFUL_RUN_HANDOFF_REASON,
            livenessState: input.livenessState,
        }),
    };
}
//# sourceMappingURL=successful-run-handoff.js.map