import { logger } from "../middleware/logger.js";
export function queueIssueAssignmentWakeup(input) {
    if (!input.issue.assigneeAgentId || input.issue.status === "backlog")
        return;
    return input.heartbeat
        .wakeup(input.issue.assigneeAgentId, {
        source: "assignment",
        triggerDetail: "system",
        reason: input.reason,
        payload: { issueId: input.issue.id, mutation: input.mutation },
        requestedByActorType: input.requestedByActorType,
        requestedByActorId: input.requestedByActorId ?? null,
        contextSnapshot: { issueId: input.issue.id, source: input.contextSource },
    })
        .catch((err) => {
        logger.warn({ err, issueId: input.issue.id }, "failed to wake assignee on issue assignment");
        if (input.rethrowOnError)
            throw err;
        return null;
    });
}
//# sourceMappingURL=issue-assignment-wakeup.js.map