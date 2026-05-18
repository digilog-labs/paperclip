const HUMAN_COMPANY_MEMBERSHIP_ROLES = [
    "owner",
    "admin",
    "operator",
    "viewer",
];
export function normalizeHumanRole(value, fallback = "operator") {
    if (value === "member")
        return "operator";
    return HUMAN_COMPANY_MEMBERSHIP_ROLES.includes(value)
        ? value
        : fallback;
}
export function grantsForHumanRole(role) {
    switch (role) {
        case "owner":
            return [
                { permissionKey: "agents:create", scope: null },
                { permissionKey: "users:invite", scope: null },
                { permissionKey: "users:manage_permissions", scope: null },
                { permissionKey: "tasks:assign", scope: null },
                { permissionKey: "joins:approve", scope: null },
            ];
        case "admin":
            return [
                { permissionKey: "agents:create", scope: null },
                { permissionKey: "users:invite", scope: null },
                { permissionKey: "tasks:assign", scope: null },
                { permissionKey: "joins:approve", scope: null },
            ];
        case "operator":
            return [{ permissionKey: "tasks:assign", scope: null }];
        case "viewer":
            return [];
    }
}
export function resolveHumanInviteRole(defaultsPayload) {
    if (!defaultsPayload || typeof defaultsPayload !== "object")
        return "operator";
    const scoped = defaultsPayload.human;
    if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) {
        return "operator";
    }
    return normalizeHumanRole(scoped.role, "operator");
}
//# sourceMappingURL=company-member-roles.js.map