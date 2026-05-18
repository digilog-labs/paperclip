import { and, desc, eq, inArray, not } from "drizzle-orm";
import { agents, approvals, heartbeatRuns } from "@paperclipai/db";
const ACTIONABLE_APPROVAL_STATUSES = ["pending", "revision_requested"];
const FAILED_HEARTBEAT_STATUSES = ["failed", "timed_out"];
function normalizeTimestamp(value) {
    if (!value)
        return 0;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}
function isDismissed(dismissedAtByKey, itemKey, activityAt) {
    const dismissedAt = dismissedAtByKey.get(itemKey);
    if (dismissedAt == null)
        return false;
    return dismissedAt >= normalizeTimestamp(activityAt);
}
export function sidebarBadgeService(db) {
    return {
        get: async (companyId, extra) => {
            const actionableApprovals = await db
                .select({ id: approvals.id, updatedAt: approvals.updatedAt })
                .from(approvals)
                .where(and(eq(approvals.companyId, companyId), inArray(approvals.status, ACTIONABLE_APPROVAL_STATUSES)))
                .then((rows) => rows.filter((row) => !isDismissed(extra?.dismissals ?? new Map(), `approval:${row.id}`, row.updatedAt)).length);
            const latestRunByAgent = await db
                .selectDistinctOn([heartbeatRuns.agentId], {
                id: heartbeatRuns.id,
                runStatus: heartbeatRuns.status,
                createdAt: heartbeatRuns.createdAt,
            })
                .from(heartbeatRuns)
                .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
                .where(and(eq(heartbeatRuns.companyId, companyId), eq(agents.companyId, companyId), not(eq(agents.status, "terminated"))))
                .orderBy(heartbeatRuns.agentId, desc(heartbeatRuns.createdAt));
            const failedRuns = latestRunByAgent.filter((row) => FAILED_HEARTBEAT_STATUSES.includes(row.runStatus)
                && !isDismissed(extra?.dismissals ?? new Map(), `run:${row.id}`, row.createdAt)).length;
            const joinRequests = (extra?.joinRequests ?? []).filter((row) => !isDismissed(extra?.dismissals ?? new Map(), `join:${row.id}`, row.updatedAt ?? row.createdAt)).length;
            const unreadTouchedIssues = extra?.unreadTouchedIssues ?? 0;
            return {
                inbox: actionableApprovals + failedRuns + joinRequests + unreadTouchedIssues,
                approvals: actionableApprovals,
                failedRuns,
                joinRequests,
            };
        },
    };
}
//# sourceMappingURL=sidebar-badges.js.map