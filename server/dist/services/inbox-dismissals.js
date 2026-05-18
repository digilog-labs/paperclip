import { and, desc, eq } from "drizzle-orm";
import { inboxDismissals } from "@paperclipai/db";
export function inboxDismissalService(db) {
    return {
        list: async (companyId, userId) => db
            .select()
            .from(inboxDismissals)
            .where(and(eq(inboxDismissals.companyId, companyId), eq(inboxDismissals.userId, userId)))
            .orderBy(desc(inboxDismissals.updatedAt)),
        dismiss: async (companyId, userId, itemKey, dismissedAt = new Date()) => {
            const now = new Date();
            const [row] = await db
                .insert(inboxDismissals)
                .values({
                companyId,
                userId,
                itemKey,
                dismissedAt,
                updatedAt: now,
            })
                .onConflictDoUpdate({
                target: [inboxDismissals.companyId, inboxDismissals.userId, inboxDismissals.itemKey],
                set: {
                    dismissedAt,
                    updatedAt: now,
                },
            })
                .returning();
            return row;
        },
    };
}
//# sourceMappingURL=inbox-dismissals.js.map