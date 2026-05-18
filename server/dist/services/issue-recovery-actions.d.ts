import type { Db } from "@paperclipai/db";
import type { IssueRecoveryAction, IssueRecoveryActionKind, IssueRecoveryActionOwnerType, IssueRecoveryActionOutcome, IssueRecoveryActionStatus } from "@paperclipai/shared";
type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTransaction = Db | DbTransaction;
export type UpsertIssueRecoveryActionInput = {
    companyId: string;
    sourceIssueId: string;
    recoveryIssueId?: string | null;
    kind: IssueRecoveryActionKind;
    ownerType?: IssueRecoveryActionOwnerType;
    ownerAgentId?: string | null;
    ownerUserId?: string | null;
    previousOwnerAgentId?: string | null;
    returnOwnerAgentId?: string | null;
    cause: string;
    fingerprint: string;
    evidence?: Record<string, unknown>;
    nextAction: string;
    wakePolicy?: Record<string, unknown> | null;
    monitorPolicy?: Record<string, unknown> | null;
    maxAttempts?: number | null;
    timeoutAt?: Date | null;
    lastAttemptAt?: Date | null;
};
export type ResolveIssueRecoveryActionInput = {
    companyId: string;
    sourceIssueId: string;
    actionId?: string | null;
    status: Extract<IssueRecoveryActionStatus, "resolved" | "cancelled">;
    outcome: IssueRecoveryActionOutcome;
    resolutionNote?: string | null;
};
export declare function issueRecoveryActionService(db: Db): {
    getActiveForIssue: (companyId: string, sourceIssueId: string) => Promise<IssueRecoveryAction | null>;
    listActiveForIssues: (companyId: string, sourceIssueIds: string[]) => Promise<Map<string, IssueRecoveryAction>>;
    resolveActiveForIssue: (input: ResolveIssueRecoveryActionInput, dbOrTx?: DbOrTransaction) => Promise<IssueRecoveryAction | null>;
    upsertSourceScoped: (input: UpsertIssueRecoveryActionInput) => Promise<IssueRecoveryAction>;
};
export {};
//# sourceMappingURL=issue-recovery-actions.d.ts.map