import { and, eq } from "drizzle-orm";
import { companyUserSidebarPreferences, userSidebarPreferences, } from "@paperclipai/db";
function normalizeOrderedIds(value) {
    if (!Array.isArray(value))
        return [];
    const orderedIds = [];
    const seen = new Set();
    for (const item of value) {
        if (typeof item !== "string")
            continue;
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        orderedIds.push(trimmed);
    }
    return orderedIds;
}
function toPreference(orderedIds, updatedAt) {
    return {
        orderedIds: normalizeOrderedIds(orderedIds),
        updatedAt,
    };
}
export function sidebarPreferenceService(db) {
    return {
        async getCompanyOrder(userId) {
            const row = await db.query.userSidebarPreferences.findFirst({
                where: eq(userSidebarPreferences.userId, userId),
            });
            return toPreference(row?.companyOrder ?? [], row?.updatedAt ?? null);
        },
        async upsertCompanyOrder(userId, orderedIds) {
            const now = new Date();
            const normalized = normalizeOrderedIds(orderedIds);
            const [row] = await db
                .insert(userSidebarPreferences)
                .values({
                userId,
                companyOrder: normalized,
                updatedAt: now,
            })
                .onConflictDoUpdate({
                target: [userSidebarPreferences.userId],
                set: {
                    companyOrder: normalized,
                    updatedAt: now,
                },
            })
                .returning();
            return toPreference(row?.companyOrder ?? normalized, row?.updatedAt ?? now);
        },
        async getProjectOrder(companyId, userId) {
            const row = await db.query.companyUserSidebarPreferences.findFirst({
                where: and(eq(companyUserSidebarPreferences.companyId, companyId), eq(companyUserSidebarPreferences.userId, userId)),
            });
            return toPreference(row?.projectOrder ?? [], row?.updatedAt ?? null);
        },
        async upsertProjectOrder(companyId, userId, orderedIds) {
            const now = new Date();
            const normalized = normalizeOrderedIds(orderedIds);
            const [row] = await db
                .insert(companyUserSidebarPreferences)
                .values({
                companyId,
                userId,
                projectOrder: normalized,
                updatedAt: now,
            })
                .onConflictDoUpdate({
                target: [companyUserSidebarPreferences.companyId, companyUserSidebarPreferences.userId],
                set: {
                    projectOrder: normalized,
                    updatedAt: now,
                },
            })
                .returning();
            return toPreference(row?.projectOrder ?? normalized, row?.updatedAt ?? now);
        },
    };
}
//# sourceMappingURL=sidebar-preferences.js.map