import type { IssueExecutionDecision, IssueExecutionMonitorClearReason, IssueExecutionPolicy, IssueExecutionStagePrincipal, IssueExecutionState, IssueMonitorScheduledBy } from "@paperclipai/shared";
type AssigneeLike = {
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
};
type IssueLike = AssigneeLike & {
    status: string;
    executionPolicy?: IssueExecutionPolicy | Record<string, unknown> | null;
    executionState?: IssueExecutionState | Record<string, unknown> | null;
    monitorNextCheckAt?: Date | null;
    monitorWakeRequestedAt?: Date | null;
    monitorLastTriggeredAt?: Date | null;
    monitorAttemptCount?: number | null;
    monitorNotes?: string | null;
    monitorScheduledBy?: string | null;
};
type ActorLike = {
    agentId?: string | null;
    userId?: string | null;
};
type RequestedAssigneePatch = {
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
};
type TransitionInput = {
    issue: IssueLike;
    policy: IssueExecutionPolicy | null;
    previousPolicy?: IssueExecutionPolicy | null;
    requestedStatus?: string;
    requestedAssigneePatch: RequestedAssigneePatch;
    actor: ActorLike;
    commentBody?: string | null;
    reviewRequest?: IssueExecutionState["reviewRequest"] | null;
    monitorExplicitlyUpdated?: boolean;
};
type TransitionResult = {
    patch: Record<string, unknown>;
    decision?: Pick<IssueExecutionDecision, "stageId" | "stageType" | "outcome" | "body">;
    workflowControlledAssignment?: boolean;
};
export declare const REDACTED_ISSUE_MONITOR_EXTERNAL_REF = "[redacted]";
export declare function redactIssueMonitorExternalRef(value: string | null | undefined): "[redacted]" | null;
export declare function stripMonitorFromExecutionPolicy(policy: IssueExecutionPolicy | null): IssueExecutionPolicy | null;
export declare function setIssueExecutionPolicyMonitorScheduledBy(policy: IssueExecutionPolicy | null, scheduledBy: IssueMonitorScheduledBy): IssueExecutionPolicy | null;
export declare function normalizeIssueExecutionPolicy(input: unknown): IssueExecutionPolicy | null;
export declare function parseIssueExecutionState(input: unknown): IssueExecutionState | null;
export declare function assigneePrincipal(input: AssigneeLike): IssueExecutionStagePrincipal | null;
export declare function buildInitialIssueMonitorFields(input: {
    policy: IssueExecutionPolicy | null;
    status: string;
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
}): {
    monitorNextCheckAt?: undefined;
    monitorWakeRequestedAt?: undefined;
    monitorNotes?: undefined;
    monitorScheduledBy?: undefined;
    executionState?: undefined;
} | {
    monitorNextCheckAt: Date;
    monitorWakeRequestedAt: null;
    monitorNotes: string | null;
    monitorScheduledBy: "board" | "assignee";
    executionState: Record<string, unknown> | null;
};
export declare function buildIssueMonitorTriggeredPatch(input: {
    issue: IssueLike;
    policy: IssueExecutionPolicy | null;
    triggeredAt: Date;
}): {
    executionPolicy: Record<string, unknown> | null;
    executionState: Record<string, unknown> | null;
    monitorNextCheckAt: null;
    monitorWakeRequestedAt: null;
    monitorLastTriggeredAt: Date;
    monitorAttemptCount: number;
    monitorNotes: string | null;
    monitorScheduledBy: "board" | "assignee" | null;
};
export declare function buildIssueMonitorClearedPatch(input: {
    issue: IssueLike;
    policy: IssueExecutionPolicy | null;
    clearReason: IssueExecutionMonitorClearReason;
    clearedAt?: Date;
}): {
    executionPolicy: Record<string, unknown> | null;
    executionState: Record<string, unknown> | null;
    monitorNextCheckAt: null;
    monitorWakeRequestedAt: null;
};
export declare function applyIssueExecutionPolicyTransition(input: TransitionInput): TransitionResult;
export {};
//# sourceMappingURL=issue-execution-policy.d.ts.map