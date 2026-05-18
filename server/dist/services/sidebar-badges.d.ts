import type { Db } from "@paperclipai/db";
import type { SidebarBadges } from "@paperclipai/shared";
export declare function sidebarBadgeService(db: Db): {
    get: (companyId: string, extra?: {
        dismissals?: ReadonlyMap<string, number>;
        joinRequests?: Array<{
            id: string;
            updatedAt: Date | string | null;
            createdAt: Date | string;
        }>;
        unreadTouchedIssues?: number;
    }) => Promise<SidebarBadges>;
};
//# sourceMappingURL=sidebar-badges.d.ts.map