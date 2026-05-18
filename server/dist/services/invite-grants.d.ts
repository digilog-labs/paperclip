import { PERMISSION_KEYS } from "@paperclipai/shared";
import type { HumanCompanyMembershipRole } from "@paperclipai/shared";
export declare function grantsFromDefaults(defaultsPayload: Record<string, unknown> | null | undefined, key: "human" | "agent"): Array<{
    permissionKey: (typeof PERMISSION_KEYS)[number];
    scope: Record<string, unknown> | null;
}>;
export declare function agentJoinGrantsFromDefaults(defaultsPayload: Record<string, unknown> | null | undefined): Array<{
    permissionKey: (typeof PERMISSION_KEYS)[number];
    scope: Record<string, unknown> | null;
}>;
export declare function humanJoinGrantsFromDefaults(defaultsPayload: Record<string, unknown> | null | undefined, membershipRole: HumanCompanyMembershipRole): Array<{
    permissionKey: (typeof PERMISSION_KEYS)[number];
    scope: Record<string, unknown> | null;
}>;
//# sourceMappingURL=invite-grants.d.ts.map