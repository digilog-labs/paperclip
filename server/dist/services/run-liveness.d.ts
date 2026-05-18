import type { HeartbeatRunStatus, IssueStatus, RunLivenessState } from "@paperclipai/shared";
export type RunLivenessActionability = "runnable" | "manager_review" | "blocked_external" | "approval_required" | "unknown";
export interface RunLivenessIssueInput {
    status: IssueStatus | string;
    title: string;
    description: string | null;
}
export interface RunLivenessEvidenceInput {
    issueCommentsCreated: number;
    documentRevisionsCreated: number;
    planDocumentRevisionsCreated: number;
    workProductsCreated: number;
    workspaceOperationsCreated: number;
    activityEventsCreated: number;
    toolOrActionEventsCreated: number;
    latestEvidenceAt: Date | null;
}
export interface RunLivenessClassificationInput {
    runStatus: HeartbeatRunStatus | string;
    issue: RunLivenessIssueInput | null;
    resultJson?: Record<string, unknown> | null;
    issueCommentBodies?: string[] | null;
    continuationSummaryBody?: string | null;
    stdoutExcerpt?: string | null;
    stderrExcerpt?: string | null;
    error?: string | null;
    errorCode?: string | null;
    continuationAttempt?: number | null;
    evidence?: Partial<RunLivenessEvidenceInput> | null;
}
export interface RunLivenessClassification {
    livenessState: RunLivenessState;
    livenessReason: string;
    continuationAttempt: number;
    lastUsefulActionAt: Date | null;
    nextAction: string | null;
    actionability: RunLivenessActionability;
}
export declare function hasUsefulOutput(input: RunLivenessClassificationInput): boolean;
export declare function declaredBlocker(input: RunLivenessClassificationInput): boolean;
export declare function looksLikePlanningOnly(input: RunLivenessClassificationInput): boolean;
export declare function isPlanningOrDocumentTask(issue: RunLivenessIssueInput | null | undefined): boolean;
export declare function hasConcreteActionEvidence(evidence: Partial<RunLivenessEvidenceInput> | null | undefined): boolean;
export declare function classifyRunActionability(input: RunLivenessClassificationInput): RunLivenessActionability;
export declare function classifyRunLiveness(input: RunLivenessClassificationInput): RunLivenessClassification;
//# sourceMappingURL=run-liveness.d.ts.map