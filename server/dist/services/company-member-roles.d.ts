import { PERMISSION_KEYS } from "@paperclipai/shared";
import type { HumanCompanyMembershipRole } from "@paperclipai/shared";
export declare function normalizeHumanRole(value: unknown, fallback?: HumanCompanyMembershipRole): HumanCompanyMembershipRole;
export declare function grantsForHumanRole(role: HumanCompanyMembershipRole): Array<{
    permissionKey: (typeof PERMISSION_KEYS)[number];
    scope: Record<string, unknown> | null;
}>;
export declare function resolveHumanInviteRole(defaultsPayload: Record<string, unknown> | null | undefined): HumanCompanyMembershipRole;
//# sourceMappingURL=company-member-roles.d.ts.map