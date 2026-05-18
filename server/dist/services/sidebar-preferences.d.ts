import type { Db } from "@paperclipai/db";
import type { SidebarOrderPreference } from "@paperclipai/shared";
export declare function sidebarPreferenceService(db: Db): {
    getCompanyOrder(userId: string): Promise<SidebarOrderPreference>;
    upsertCompanyOrder(userId: string, orderedIds: string[]): Promise<SidebarOrderPreference>;
    getProjectOrder(companyId: string, userId: string): Promise<SidebarOrderPreference>;
    upsertProjectOrder(companyId: string, userId: string, orderedIds: string[]): Promise<SidebarOrderPreference>;
};
//# sourceMappingURL=sidebar-preferences.d.ts.map