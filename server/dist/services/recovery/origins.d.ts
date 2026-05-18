export declare const RECOVERY_ORIGIN_KINDS: {
    readonly issueGraphLivenessEscalation: "harness_liveness_escalation";
    readonly issueProductivityReview: "issue_productivity_review";
    readonly strandedIssueRecovery: "stranded_issue_recovery";
    readonly staleActiveRunEvaluation: "stale_active_run_evaluation";
};
export declare const RECOVERY_REASON_KINDS: {
    readonly runLivenessContinuation: "run_liveness_continuation";
};
export declare const RECOVERY_KEY_PREFIXES: {
    readonly issueGraphLivenessIncident: "harness_liveness";
    readonly issueGraphLivenessLeaf: "harness_liveness_leaf";
};
export type RecoveryOriginKind = typeof RECOVERY_ORIGIN_KINDS[keyof typeof RECOVERY_ORIGIN_KINDS];
export type RecoveryReasonKind = typeof RECOVERY_REASON_KINDS[keyof typeof RECOVERY_REASON_KINDS];
export type RecoveryKeyPrefix = typeof RECOVERY_KEY_PREFIXES[keyof typeof RECOVERY_KEY_PREFIXES];
export declare function isStrandedIssueRecoveryOriginKind(originKind: string | null | undefined): originKind is "stranded_issue_recovery";
export declare function buildIssueGraphLivenessIncidentKey(input: {
    companyId: string;
    issueId: string;
    state: string;
    blockerIssueId?: string | null;
    participantAgentId?: string | null;
}): string;
export declare function parseIssueGraphLivenessIncidentKey(incidentKey: string | null | undefined): {
    companyId: string;
    issueId: string;
    state: string;
    leafIssueId: string;
} | null;
export declare function buildIssueGraphLivenessLeafKey(input: {
    companyId: string;
    state: string;
    leafIssueId: string;
}): string;
//# sourceMappingURL=origins.d.ts.map