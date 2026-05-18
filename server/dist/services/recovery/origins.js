export const RECOVERY_ORIGIN_KINDS = {
    issueGraphLivenessEscalation: "harness_liveness_escalation",
    issueProductivityReview: "issue_productivity_review",
    strandedIssueRecovery: "stranded_issue_recovery",
    staleActiveRunEvaluation: "stale_active_run_evaluation",
};
export const RECOVERY_REASON_KINDS = {
    runLivenessContinuation: "run_liveness_continuation",
};
export const RECOVERY_KEY_PREFIXES = {
    issueGraphLivenessIncident: "harness_liveness",
    issueGraphLivenessLeaf: "harness_liveness_leaf",
};
export function isStrandedIssueRecoveryOriginKind(originKind) {
    return originKind === RECOVERY_ORIGIN_KINDS.strandedIssueRecovery;
}
export function buildIssueGraphLivenessIncidentKey(input) {
    return [
        RECOVERY_KEY_PREFIXES.issueGraphLivenessIncident,
        input.companyId,
        input.issueId,
        input.state,
        input.blockerIssueId ?? input.participantAgentId ?? "none",
    ].join(":");
}
export function parseIssueGraphLivenessIncidentKey(incidentKey) {
    if (!incidentKey)
        return null;
    const parts = incidentKey.split(":");
    if (parts.length !== 5 || parts[0] !== RECOVERY_KEY_PREFIXES.issueGraphLivenessIncident)
        return null;
    const [, companyId, issueId, state, leafIssueId] = parts;
    if (!companyId || !issueId || !state || !leafIssueId)
        return null;
    return { companyId, issueId, state, leafIssueId };
}
export function buildIssueGraphLivenessLeafKey(input) {
    return [
        RECOVERY_KEY_PREFIXES.issueGraphLivenessLeaf,
        input.companyId,
        input.state,
        input.leafIssueId,
    ].join(":");
}
//# sourceMappingURL=origins.js.map