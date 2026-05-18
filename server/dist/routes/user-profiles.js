import { Router } from "express";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { activityLog, agents, authUsers, companyMemberships, costEvents, issueComments, issues, } from "@paperclipai/db";
import { notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
const PROFILE_WINDOWS = [
    { key: "last7", label: "Last 7 days", days: 7 },
    { key: "last30", label: "Last 30 days", days: 30 },
    { key: "all", label: "All time", days: null },
];
function slugifyUserPart(value) {
    const normalized = value
        ?.trim()
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return normalized || null;
}
function userSlugCandidates(row) {
    const candidates = new Set();
    const add = (value) => {
        const slug = slugifyUserPart(value);
        if (slug)
            candidates.add(slug);
    };
    add(row.name);
    add(row.email?.split("@")[0]);
    add(row.email);
    add(row.principalId);
    return [...candidates];
}
async function resolveCompanyUser(db, companyId, rawSlug) {
    const slug = slugifyUserPart(rawSlug);
    if (!slug)
        return null;
    const rows = await db
        .select({
        id: companyMemberships.id,
        principalId: companyMemberships.principalId,
        status: companyMemberships.status,
        membershipRole: companyMemberships.membershipRole,
        createdAt: companyMemberships.createdAt,
        userId: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
    })
        .from(companyMemberships)
        .leftJoin(authUsers, eq(authUsers.id, companyMemberships.principalId))
        .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user")))
        .orderBy(desc(companyMemberships.updatedAt))
        .limit(200);
    return rows.find((row) => userSlugCandidates(row).includes(slug)) ?? null;
}
function userIssueInvolvementSql(companyId, userId) {
    return sql `
    (
      ${issues.createdByUserId} = ${userId}
      OR ${issues.assigneeUserId} = ${userId}
      OR EXISTS (
        SELECT 1
        FROM ${issueComments}
        WHERE ${issueComments.companyId} = ${companyId}
          AND ${issueComments.issueId} = ${issues.id}
          AND ${issueComments.authorUserId} = ${userId}
      )
    )
  `;
}
function windowStart(days) {
    if (!days)
        return null;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
function startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function isoDay(date) {
    return startOfUtcDay(date).toISOString().slice(0, 10);
}
function dayKeyExpr(dateSql) {
    return sql `to_char(date_trunc('day', ${dateSql}), 'YYYY-MM-DD')`;
}
function sumNumber(column) {
    return sql `coalesce(sum(${column}), 0)::double precision`;
}
async function loadWindowStats(db, companyId, userId, key, label, from) {
    const involvement = userIssueInvolvementSql(companyId, userId);
    const openStatuses = ["backlog", "todo", "in_progress", "in_review", "blocked"];
    const fromIso = from?.toISOString();
    const [issueStats] = await db
        .select({
        touchedIssues: sql `count(distinct case when ${involvement} ${fromIso ? sql `and ${issues.updatedAt} >= ${fromIso}` : sql ``} then ${issues.id} end)::int`,
        createdIssues: sql `count(distinct case when ${issues.createdByUserId} = ${userId} ${fromIso ? sql `and ${issues.createdAt} >= ${fromIso}` : sql ``} then ${issues.id} end)::int`,
        completedIssues: sql `count(distinct case when ${involvement} and ${issues.status} = 'done' ${fromIso ? sql `and ${issues.completedAt} >= ${fromIso}` : sql ``} then ${issues.id} end)::int`,
        assignedOpenIssues: sql `count(distinct case when ${issues.assigneeUserId} = ${userId} and ${issues.status} in (${sql.join(openStatuses.map((status) => sql `${status}`), sql `, `)}) then ${issues.id} end)::int`,
    })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), isNull(issues.hiddenAt)));
    const commentConditions = [
        eq(issueComments.companyId, companyId),
        eq(issueComments.authorUserId, userId),
    ];
    if (from)
        commentConditions.push(gte(issueComments.createdAt, from));
    const [commentStats] = await db
        .select({ count: sql `count(*)::int` })
        .from(issueComments)
        .where(and(...commentConditions));
    const activityConditions = [
        eq(activityLog.companyId, companyId),
        eq(activityLog.actorType, "user"),
        eq(activityLog.actorId, userId),
    ];
    if (from)
        activityConditions.push(gte(activityLog.createdAt, from));
    const [activityStats] = await db
        .select({ count: sql `count(*)::int` })
        .from(activityLog)
        .where(and(...activityConditions));
    const costConditions = [
        eq(costEvents.companyId, companyId),
        userIssueInvolvementSql(companyId, userId),
    ];
    if (from)
        costConditions.push(gte(costEvents.occurredAt, from));
    const [costStats] = await db
        .select({
        costCents: sumNumber(costEvents.costCents),
        inputTokens: sumNumber(costEvents.inputTokens),
        cachedInputTokens: sumNumber(costEvents.cachedInputTokens),
        outputTokens: sumNumber(costEvents.outputTokens),
        costEventCount: sql `count(${costEvents.id})::int`,
    })
        .from(costEvents)
        .innerJoin(issues, and(eq(issues.id, costEvents.issueId), eq(issues.companyId, costEvents.companyId)))
        .where(and(...costConditions));
    return {
        key,
        label,
        touchedIssues: Number(issueStats?.touchedIssues ?? 0),
        createdIssues: Number(issueStats?.createdIssues ?? 0),
        completedIssues: Number(issueStats?.completedIssues ?? 0),
        assignedOpenIssues: Number(issueStats?.assignedOpenIssues ?? 0),
        commentCount: Number(commentStats?.count ?? 0),
        activityCount: Number(activityStats?.count ?? 0),
        costCents: Number(costStats?.costCents ?? 0),
        inputTokens: Number(costStats?.inputTokens ?? 0),
        cachedInputTokens: Number(costStats?.cachedInputTokens ?? 0),
        outputTokens: Number(costStats?.outputTokens ?? 0),
        costEventCount: Number(costStats?.costEventCount ?? 0),
    };
}
async function loadDailyStats(db, companyId, userId) {
    const firstDay = startOfUtcDay(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000));
    const points = new Map();
    for (let index = 0; index < 14; index += 1) {
        const date = new Date(firstDay.getTime() + index * 24 * 60 * 60 * 1000);
        points.set(isoDay(date), {
            date: isoDay(date),
            activityCount: 0,
            completedIssues: 0,
            costCents: 0,
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
        });
    }
    const activityDay = dayKeyExpr(sql `${activityLog.createdAt}`);
    const activityRows = await db
        .select({
        date: activityDay,
        count: sql `count(*)::int`,
    })
        .from(activityLog)
        .where(and(eq(activityLog.companyId, companyId), eq(activityLog.actorType, "user"), eq(activityLog.actorId, userId), gte(activityLog.createdAt, firstDay)))
        .groupBy(activityDay);
    for (const row of activityRows) {
        const point = points.get(row.date);
        if (point)
            point.activityCount = Number(row.count);
    }
    const completedDay = dayKeyExpr(sql `${issues.completedAt}`);
    const completedRows = await db
        .select({
        date: completedDay,
        count: sql `count(distinct ${issues.id})::int`,
    })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), isNull(issues.hiddenAt), eq(issues.status, "done"), gte(issues.completedAt, firstDay), userIssueInvolvementSql(companyId, userId)))
        .groupBy(completedDay);
    for (const row of completedRows) {
        const point = points.get(row.date);
        if (point)
            point.completedIssues = Number(row.count);
    }
    const costDay = dayKeyExpr(sql `${costEvents.occurredAt}`);
    const costRows = await db
        .select({
        date: costDay,
        costCents: sumNumber(costEvents.costCents),
        inputTokens: sumNumber(costEvents.inputTokens),
        cachedInputTokens: sumNumber(costEvents.cachedInputTokens),
        outputTokens: sumNumber(costEvents.outputTokens),
    })
        .from(costEvents)
        .innerJoin(issues, and(eq(issues.id, costEvents.issueId), eq(issues.companyId, costEvents.companyId)))
        .where(and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, firstDay), userIssueInvolvementSql(companyId, userId)))
        .groupBy(costDay);
    for (const row of costRows) {
        const point = points.get(row.date);
        if (!point)
            continue;
        point.costCents = Number(row.costCents);
        point.inputTokens = Number(row.inputTokens);
        point.cachedInputTokens = Number(row.cachedInputTokens);
        point.outputTokens = Number(row.outputTokens);
    }
    return [...points.values()];
}
export function userProfileRoutes(db) {
    const router = Router();
    router.get("/companies/:companyId/users/:userSlug/profile", async (req, res) => {
        const companyId = req.params.companyId;
        const userSlug = req.params.userSlug;
        assertCompanyAccess(req, companyId);
        const row = await resolveCompanyUser(db, companyId, userSlug);
        if (!row)
            throw notFound("User not found");
        const canonicalSlug = userSlugCandidates(row)[0] ?? row.principalId;
        const userId = row.userId ?? row.principalId;
        const [stats, daily, recentIssues, recentActivity, topAgents, topProviders] = await Promise.all([
            Promise.all(PROFILE_WINDOWS.map((entry) => loadWindowStats(db, companyId, userId, entry.key, entry.label, windowStart(entry.days)))),
            loadDailyStats(db, companyId, userId),
            db
                .select({
                id: issues.id,
                identifier: issues.identifier,
                title: issues.title,
                status: issues.status,
                priority: issues.priority,
                assigneeAgentId: issues.assigneeAgentId,
                assigneeUserId: issues.assigneeUserId,
                updatedAt: issues.updatedAt,
                completedAt: issues.completedAt,
            })
                .from(issues)
                .where(and(eq(issues.companyId, companyId), isNull(issues.hiddenAt), userIssueInvolvementSql(companyId, userId)))
                .orderBy(desc(issues.updatedAt))
                .limit(8),
            db
                .select({
                id: activityLog.id,
                action: activityLog.action,
                entityType: activityLog.entityType,
                entityId: activityLog.entityId,
                details: activityLog.details,
                createdAt: activityLog.createdAt,
            })
                .from(activityLog)
                .where(and(eq(activityLog.companyId, companyId), eq(activityLog.actorType, "user"), eq(activityLog.actorId, userId)))
                .orderBy(desc(activityLog.createdAt))
                .limit(12),
            db
                .select({
                agentId: costEvents.agentId,
                agentName: agents.name,
                costCents: sumNumber(costEvents.costCents),
                inputTokens: sumNumber(costEvents.inputTokens),
                cachedInputTokens: sumNumber(costEvents.cachedInputTokens),
                outputTokens: sumNumber(costEvents.outputTokens),
            })
                .from(costEvents)
                .innerJoin(issues, and(eq(issues.id, costEvents.issueId), eq(issues.companyId, costEvents.companyId)))
                .leftJoin(agents, eq(agents.id, costEvents.agentId))
                .where(and(eq(costEvents.companyId, companyId), userIssueInvolvementSql(companyId, userId)))
                .groupBy(costEvents.agentId, agents.name)
                .orderBy(desc(sumNumber(costEvents.costCents)))
                .limit(5),
            db
                .select({
                provider: costEvents.provider,
                biller: costEvents.biller,
                model: costEvents.model,
                costCents: sumNumber(costEvents.costCents),
                inputTokens: sumNumber(costEvents.inputTokens),
                cachedInputTokens: sumNumber(costEvents.cachedInputTokens),
                outputTokens: sumNumber(costEvents.outputTokens),
            })
                .from(costEvents)
                .innerJoin(issues, and(eq(issues.id, costEvents.issueId), eq(issues.companyId, costEvents.companyId)))
                .where(and(eq(costEvents.companyId, companyId), userIssueInvolvementSql(companyId, userId)))
                .groupBy(costEvents.provider, costEvents.biller, costEvents.model)
                .orderBy(desc(sumNumber(costEvents.costCents)))
                .limit(5),
        ]);
        const user = {
            id: userId,
            slug: canonicalSlug,
            name: row.name,
            email: row.email,
            image: row.image,
            membershipRole: row.membershipRole,
            membershipStatus: row.status,
            joinedAt: row.createdAt,
        };
        const payload = {
            user,
            stats,
            daily,
            recentIssues: recentIssues.map((issue) => ({
                ...issue,
                status: issue.status,
                priority: issue.priority,
            })),
            recentActivity,
            topAgents: topAgents.map((entry) => ({
                ...entry,
                costCents: Number(entry.costCents),
                inputTokens: Number(entry.inputTokens),
                cachedInputTokens: Number(entry.cachedInputTokens),
                outputTokens: Number(entry.outputTokens),
            })),
            topProviders: topProviders.map((entry) => ({
                ...entry,
                costCents: Number(entry.costCents),
                inputTokens: Number(entry.inputTokens),
                cachedInputTokens: Number(entry.cachedInputTokens),
                outputTokens: Number(entry.outputTokens),
            })),
        };
        res.json(payload);
    });
    return router;
}
//# sourceMappingURL=user-profiles.js.map