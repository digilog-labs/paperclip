import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, issues } from "@paperclipai/db";
import type { RunLivenessState } from "@paperclipai/shared";
export declare const RUN_LIVENESS_CONTINUATION_REASON: "run_liveness_continuation";
export declare const DEFAULT_MAX_LIVENESS_CONTINUATION_ATTEMPTS = 2;
type HeartbeatRunRow = typeof heartbeatRuns.$inferSelect;
type IssueRow = Pick<typeof issues.$inferSelect, "id" | "companyId" | "identifier" | "title" | "status" | "assigneeAgentId" | "executionState" | "projectId">;
type AgentRow = Pick<typeof agents.$inferSelect, "id" | "companyId" | "status">;
export type RunContinuationDecision = {
    kind: "enqueue";
    nextAttempt: number;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    contextSnapshot: Record<string, unknown>;
} | {
    kind: "exhausted";
    attempt: number;
    maxAttempts: number;
    comment: string;
} | {
    kind: "skip";
    reason: string;
};
export declare function readContinuationAttempt(value: unknown): number;
export declare function buildRunLivenessContinuationIdempotencyKey(input: {
    issueId: string;
    sourceRunId: string;
    livenessState: RunLivenessState;
    nextAttempt: number;
}): string;
export declare function findExistingRunLivenessContinuationWake(db: Db, input: {
    companyId: string;
    idempotencyKey: string;
}): Promise<{
    id: string;
    status: string;
}>;
export declare function decideRunLivenessContinuation(input: {
    run: HeartbeatRunRow;
    issue: IssueRow | null;
    agent: AgentRow | null;
    livenessState: RunLivenessState | null;
    livenessReason: string | null;
    nextAction: string | null;
    budgetBlocked: boolean;
    idempotentWakeExists: boolean;
    maxAttempts?: number;
}): RunContinuationDecision;
export {};
//# sourceMappingURL=run-liveness-continuations.d.ts.map