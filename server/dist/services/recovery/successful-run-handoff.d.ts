import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, issues } from "@paperclipai/db";
import type { IssueCommentMetadata, IssueCommentPresentation, RunLivenessState } from "@paperclipai/shared";
export declare const FINISH_SUCCESSFUL_RUN_HANDOFF_REASON = "finish_successful_run_handoff";
export declare const SUCCESSFUL_RUN_MISSING_STATE_REASON = "successful_run_missing_state";
export declare const DEFAULT_MAX_SUCCESSFUL_RUN_HANDOFF_ATTEMPTS = 1;
export declare const SUCCESSFUL_RUN_HANDOFF_REQUIRED_NOTICE_BODY = "Paperclip needs a disposition before this issue can continue.";
export declare const SUCCESSFUL_RUN_HANDOFF_EXHAUSTED_NOTICE_BODY = "Paperclip could not resolve this issue's missing disposition automatically. The issue is blocked on a recovery owner.";
export declare const LEGACY_SUCCESSFUL_RUN_HANDOFF_NOTICE_PREFIXES: readonly ["## This issue still needs a next step", "## Successful run missing issue disposition"];
export declare const SUCCESSFUL_RUN_HANDOFF_OPTIONS: readonly ["mark_done_or_cancelled", "send_for_review_or_ask_for_input", "mark_blocked", "delegate_or_continue_from_checkpoint"];
export declare function isIdempotentFinishSuccessfulRunHandoffWakeStatus(status: string): boolean;
type HeartbeatRunRow = typeof heartbeatRuns.$inferSelect;
type IssueRow = Pick<typeof issues.$inferSelect, "id" | "companyId" | "identifier" | "title" | "status" | "assigneeAgentId" | "assigneeUserId" | "executionState">;
type AgentRow = Pick<typeof agents.$inferSelect, "id" | "companyId" | "status">;
type NoticeIssue = Pick<typeof issues.$inferSelect, "id" | "identifier" | "title" | "status">;
type NoticeRun = Pick<typeof heartbeatRuns.$inferSelect, "id" | "status">;
type NoticeAgent = Pick<typeof agents.$inferSelect, "id" | "name">;
type NullableNoticeAgent = NoticeAgent | null | undefined;
type NullableNoticeIssue = NoticeIssue | null | undefined;
type NullableNoticeRun = NoticeRun | null | undefined;
export type SuccessfulRunHandoffNotice = {
    body: string;
    presentation: IssueCommentPresentation;
    metadata: IssueCommentMetadata;
};
export declare function noticeMetadataReferencesRecoveryAction(metadata: IssueCommentMetadata | null | undefined, recoveryActionId: string): boolean;
export type SuccessfulRunHandoffDecision = {
    kind: "enqueue";
    idempotencyKey: string;
    payload: Record<string, unknown>;
    contextSnapshot: Record<string, unknown>;
    instruction: string;
} | {
    kind: "skip";
    reason: string;
};
export declare function isSuccessfulRunHandoffRequiredNoticeBody(body: string): boolean;
export declare function buildSuccessfulRunHandoffRequiredNotice(input: {
    issue: NoticeIssue;
    run: NoticeRun;
    agent: NoticeAgent;
    detectedProgressSummary: string;
}): SuccessfulRunHandoffNotice;
export declare function buildSuccessfulRunHandoffExhaustedNotice(input: {
    issue: NoticeIssue;
    sourceRun: NullableNoticeRun;
    correctiveRun: NullableNoticeRun;
    sourceAssignee: NullableNoticeAgent;
    recoveryIssue: NullableNoticeIssue;
    recoveryActionId?: string | null;
    recoveryOwner: NullableNoticeAgent;
    latestIssueStatus: string;
    latestHandoffRunStatus: string;
    missingDisposition: string;
}): SuccessfulRunHandoffNotice;
export declare function buildFinishSuccessfulRunHandoffIdempotencyKey(input: {
    issueId: string;
    sourceRunId: string;
    attempt?: number;
}): string;
export declare function findExistingFinishSuccessfulRunHandoffWake(db: Db, input: {
    companyId: string;
    idempotencyKey: string;
}): Promise<{
    id: string;
    status: string;
}>;
export declare function buildSuccessfulRunHandoffInstruction(input: {
    issueIdentifier: string | null;
    sourceRunId: string;
}): string;
export declare function decideSuccessfulRunHandoff(input: {
    run: HeartbeatRunRow;
    issue: IssueRow | null;
    agent: AgentRow | null;
    livenessState: RunLivenessState | null;
    detectedProgressSummary: string | null;
    taskKey: string | null;
    hasActiveExecutionPath: boolean;
    hasQueuedWake: boolean;
    hasPendingInteractionOrApproval: boolean;
    hasExplicitBlockerPath: boolean;
    hasOpenRecoveryIssue: boolean;
    hasPauseHold: boolean;
    budgetBlocked: boolean;
    idempotentWakeExists: boolean;
}): SuccessfulRunHandoffDecision;
export {};
//# sourceMappingURL=successful-run-handoff.d.ts.map