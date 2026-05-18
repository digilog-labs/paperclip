export type IssueLivenessSeverity = "warning" | "critical";
export type IssueLivenessState = "blocked_by_unassigned_issue" | "blocked_by_assigned_backlog_issue" | "blocked_by_uninvokable_assignee" | "blocked_by_cancelled_issue" | "invalid_review_participant" | "in_review_without_action_path";
export interface IssueLivenessIssueInput {
    id: string;
    companyId: string;
    identifier: string | null;
    title: string;
    status: string;
    projectId?: string | null;
    goalId?: string | null;
    parentId?: string | null;
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
    createdByAgentId?: string | null;
    createdByUserId?: string | null;
    executionPolicy?: Record<string, unknown> | null;
    executionState?: Record<string, unknown> | null;
    monitorNextCheckAt?: Date | string | null;
    monitorAttemptCount?: number | null;
}
export interface IssueLivenessRelationInput {
    companyId: string;
    blockerIssueId: string;
    blockedIssueId: string;
}
export interface IssueLivenessAgentInput {
    id: string;
    companyId: string;
    name: string;
    role: string;
    title?: string | null;
    status: string;
    reportsTo?: string | null;
}
export interface IssueLivenessExecutionPathInput {
    companyId: string;
    issueId: string | null;
    agentId?: string | null;
    status: string;
}
export interface IssueLivenessWaitingPathInput {
    companyId: string;
    issueId: string;
    status: string;
}
export interface IssueLivenessDependencyPathEntry {
    issueId: string;
    identifier: string | null;
    title: string;
    status: string;
}
export type IssueLivenessOwnerCandidateReason = "stalled_blocker_assignee" | "assignee_reporting_chain" | "creator_reporting_chain" | "root_agent" | "ordered_invokable_fallback";
export interface IssueLivenessOwnerCandidate {
    agentId: string;
    reason: IssueLivenessOwnerCandidateReason;
    sourceIssueId: string;
}
export interface IssueLivenessFinding {
    issueId: string;
    companyId: string;
    identifier: string | null;
    state: IssueLivenessState;
    severity: IssueLivenessSeverity;
    reason: string;
    dependencyPath: IssueLivenessDependencyPathEntry[];
    recoveryIssueId: string;
    recommendedOwnerAgentId: string | null;
    recommendedOwnerCandidateAgentIds: string[];
    recommendedOwnerCandidates: IssueLivenessOwnerCandidate[];
    recommendedAction: string;
    incidentKey: string;
}
export interface IssueGraphLivenessInput {
    issues: IssueLivenessIssueInput[];
    relations: IssueLivenessRelationInput[];
    agents: IssueLivenessAgentInput[];
    activeRuns?: IssueLivenessExecutionPathInput[];
    queuedWakeRequests?: IssueLivenessExecutionPathInput[];
    pendingInteractions?: IssueLivenessWaitingPathInput[];
    pendingApprovals?: IssueLivenessWaitingPathInput[];
    openRecoveryIssues?: IssueLivenessWaitingPathInput[];
    now?: Date | string;
}
export declare function classifyIssueGraphLiveness(input: IssueGraphLivenessInput): IssueLivenessFinding[];
//# sourceMappingURL=issue-graph-liveness.d.ts.map