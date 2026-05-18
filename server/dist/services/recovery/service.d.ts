import type { Db } from "@paperclipai/db";
import { type IssueGraphLivenessAutoRecoveryPreview } from "@paperclipai/shared";
import { heartbeatRuns, issues } from "@paperclipai/db";
import { SUCCESSFUL_RUN_MISSING_STATE_REASON } from "./successful-run-handoff.js";
export declare const ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS: number;
export declare const ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS: number;
export declare const ACTIVE_RUN_OUTPUT_CONTINUE_REARM_MS: number;
type RecoveryWakeupOptions = {
    source?: "timer" | "assignment" | "on_demand" | "automation";
    triggerDetail?: "manual" | "ping" | "callback" | "system";
    reason?: string | null;
    payload?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
    requestedByActorType?: "user" | "agent" | "system";
    requestedByActorId?: string | null;
    contextSnapshot?: Record<string, unknown>;
};
type RecoveryWakeup = (agentId: string, opts?: RecoveryWakeupOptions) => Promise<typeof heartbeatRuns.$inferSelect | null>;
type LatestIssueRun = Pick<typeof heartbeatRuns.$inferSelect, "id" | "agentId" | "status" | "error" | "errorCode" | "contextSnapshot" | "livenessState"> | null;
type StrandedRecoveryCause = "stranded_assigned_issue" | typeof SUCCESSFUL_RUN_MISSING_STATE_REASON;
type SuccessfulRunHandoffRecoveryEvidence = {
    sourceRunId: string | null;
    correctiveRunId: string;
    missingDisposition: string;
    handoffAttempt: number;
    maxHandoffAttempts: number;
};
type WatchdogDecisionActor = {
    type: "board";
    userId?: string | null;
    runId?: string | null;
} | {
    type: "agent";
    agentId?: string | null;
    runId?: string | null;
} | {
    type: "none";
};
export type RunOutputSilenceSummary = {
    lastOutputAt: Date | null;
    lastOutputSeq: number;
    lastOutputStream: "stdout" | "stderr" | null;
    silenceStartedAt: Date | null;
    silenceAgeMs: number | null;
    level: "not_applicable" | "ok" | "suspicious" | "critical" | "snoozed";
    suspicionThresholdMs: number;
    criticalThresholdMs: number;
    snoozedUntil: Date | null;
    evaluationIssueId: string | null;
    evaluationIssueIdentifier: string | null;
    evaluationIssueAssigneeAgentId: string | null;
};
export declare function recoveryService(db: Db, deps: {
    enqueueWakeup: RecoveryWakeup;
}): {
    buildRunOutputSilence: (run: Pick<typeof heartbeatRuns.$inferSelect, "id" | "companyId" | "status" | "lastOutputAt" | "lastOutputSeq" | "lastOutputStream" | "processStartedAt" | "startedAt" | "createdAt">, now?: Date) => Promise<RunOutputSilenceSummary>;
    escalateStrandedRecoveryIssueInPlace: (input: {
        issue: typeof issues.$inferSelect;
        previousStatus: "todo" | "in_progress";
        latestRun: LatestIssueRun;
    }) => Promise<({
        id: string;
        description: string | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        title: string;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        identifier: string | null;
        cancelledAt: Date | null;
        startedAt: Date | null;
        projectId: string | null;
        projectWorkspaceId: string | null;
        executionWorkspaceId: string | null;
        priority: string;
        assigneeAgentId: string | null;
        assigneeUserId: string | null;
        goalId: string | null;
        parentId: string | null;
        workMode: string;
        requestDepth: number;
        billingCode: string | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        executionPolicy: Record<string, unknown> | null;
        executionWorkspacePreference: string | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        hiddenAt: Date | null;
        originId: string | null;
        checkoutRunId: string | null;
        executionRunId: string | null;
        executionAgentNameKey: string | null;
        executionLockedAt: Date | null;
        issueNumber: number | null;
        originKind: string;
        originRunId: string | null;
        originFingerprint: string;
        executionState: Record<string, unknown> | null;
        monitorNextCheckAt: Date | null;
        monitorWakeRequestedAt: Date | null;
        monitorLastTriggeredAt: Date | null;
        monitorAttemptCount: number;
        monitorNotes: string | null;
        monitorScheduledBy: string | null;
        completedAt: Date | null;
    } & {
        labels: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            companyId: string;
            color: string;
        }[];
        labelIds: string[];
    }) | null>;
    escalateStrandedAssignedIssue: (input: {
        issue: typeof issues.$inferSelect;
        previousStatus: "todo" | "in_progress";
        latestRun: LatestIssueRun;
        comment?: string;
        recoveryCause?: StrandedRecoveryCause;
        successfulRunHandoffEvidence?: SuccessfulRunHandoffRecoveryEvidence | null;
    }) => Promise<({
        id: string;
        description: string | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        title: string;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        identifier: string | null;
        cancelledAt: Date | null;
        startedAt: Date | null;
        projectId: string | null;
        projectWorkspaceId: string | null;
        executionWorkspaceId: string | null;
        priority: string;
        assigneeAgentId: string | null;
        assigneeUserId: string | null;
        goalId: string | null;
        parentId: string | null;
        workMode: string;
        requestDepth: number;
        billingCode: string | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        executionPolicy: Record<string, unknown> | null;
        executionWorkspacePreference: string | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        hiddenAt: Date | null;
        originId: string | null;
        checkoutRunId: string | null;
        executionRunId: string | null;
        executionAgentNameKey: string | null;
        executionLockedAt: Date | null;
        issueNumber: number | null;
        originKind: string;
        originRunId: string | null;
        originFingerprint: string;
        executionState: Record<string, unknown> | null;
        monitorNextCheckAt: Date | null;
        monitorWakeRequestedAt: Date | null;
        monitorLastTriggeredAt: Date | null;
        monitorAttemptCount: number;
        monitorNotes: string | null;
        monitorScheduledBy: string | null;
        completedAt: Date | null;
    } & {
        labels: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            companyId: string;
            color: string;
        }[];
        labelIds: string[];
    }) | null>;
    recordWatchdogDecision: (input: {
        runId: string;
        actor: WatchdogDecisionActor;
        decision: "snooze" | "continue" | "dismissed_false_positive";
        evaluationIssueId?: string | null;
        reason?: string | null;
        snoozedUntil?: Date | null;
        createdByRunId?: string | null;
        now?: Date;
    }) => Promise<{
        id: string;
        createdAt: Date;
        companyId: string;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        reason: string | null;
        runId: string;
        createdByRunId: string | null;
        evaluationIssueId: string | null;
        decision: string;
        snoozedUntil: Date | null;
    }>;
    scanSilentActiveRuns: (opts?: {
        now?: Date;
        companyId?: string;
    }) => Promise<{
        scanned: number;
        created: number;
        existing: number;
        escalated: number;
        folded: number;
        snoozed: number;
        skipped: number;
        evaluationIssueIds: string[];
    }>;
    reconcileStrandedAssignedIssues: () => Promise<{
        assignmentDispatched: number;
        dispatchRequeued: number;
        continuationRequeued: number;
        productiveContinuationObserved: number;
        successfulContinuationObserved: number;
        orphanBlockersAssigned: number;
        successfulRunHandoffEscalated: number;
        escalated: number;
        skipped: number;
        issueIds: string[];
    }>;
    buildIssueGraphLivenessAutoRecoveryPreview: (opts?: {
        lookbackHours?: number;
        now?: Date;
    }) => Promise<IssueGraphLivenessAutoRecoveryPreview>;
    reconcileIssueGraphLiveness: (opts?: {
        runId?: string | null;
        force?: boolean;
        lookbackHours?: number;
    }) => Promise<{
        findings: number;
        autoRecoveryEnabled: boolean;
        lookbackHours: number;
        cutoff: string;
        escalationsCreated: number;
        existingEscalations: number;
        skipped: number;
        skippedAutoRecoveryDisabled: number;
        skippedOutsideLookback: number;
        obsoleteRecoveriesRetired: number;
        obsoleteRecoveriesActiveSkipped: number;
        obsoleteRecoveryBlockerRelationsRemoved: number;
        issueIds: string[];
        escalationIssueIds: string[];
        retiredRecoveryIssueIds: string[];
    }>;
    readRecoveryTimerIntervalMs: (raw: unknown, fallback: number) => number;
};
export {};
//# sourceMappingURL=service.d.ts.map