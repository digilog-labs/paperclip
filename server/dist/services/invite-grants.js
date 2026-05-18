import { PERMISSION_KEYS } from "@paperclipai/shared";
import { grantsForHumanRole } from "./company-member-roles.js";
export function grantsFromDefaults(defaultsPayload, key) {
    if (!defaultsPayload || typeof defaultsPayload !== "object")
        return [];
    const scoped = defaultsPayload[key];
    if (!scoped || typeof scoped !== "object")
        return [];
    const grants = scoped.grants;
    if (!Array.isArray(grants))
        return [];
    const validPermissionKeys = new Set(PERMISSION_KEYS);
    const result = [];
    for (const item of grants) {
        if (!item || typeof item !== "object")
            continue;
        const record = item;
        if (typeof record.permissionKey !== "string")
            continue;
        if (!validPermissionKeys.has(record.permissionKey))
            continue;
        result.push({
            permissionKey: record.permissionKey,
            scope: record.scope &&
                typeof record.scope === "object" &&
                !Array.isArray(record.scope)
                ? record.scope
                : null,
        });
    }
    return result;
}
export function agentJoinGrantsFromDefaults(defaultsPayload) {
    const grants = grantsFromDefaults(defaultsPayload, "agent");
    if (grants.some((grant) => grant.permissionKey === "tasks:assign")) {
        return grants;
    }
    return [
        ...grants,
        {
            permissionKey: "tasks:assign",
            scope: null,
        },
    ];
}
export function humanJoinGrantsFromDefaults(defaultsPayload, membershipRole) {
    const grants = grantsFromDefaults(defaultsPayload, "human");
    return grants.length > 0 ? grants : grantsForHumanRole(membershipRole);
}
//# sourceMappingURL=invite-grants.js.map