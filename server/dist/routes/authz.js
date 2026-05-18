import { forbidden, unauthorized } from "../errors.js";
export function assertAuthenticated(req) {
    if (req.actor.type === "none") {
        throw unauthorized();
    }
}
export function assertBoard(req) {
    if (req.actor.type !== "board") {
        throw forbidden("Board access required");
    }
}
export function hasBoardOrgAccess(req) {
    if (req.actor.type !== "board") {
        return false;
    }
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
        return true;
    }
    return Array.isArray(req.actor.companyIds) && req.actor.companyIds.length > 0;
}
export function assertBoardOrgAccess(req) {
    assertBoard(req);
    if (hasBoardOrgAccess(req)) {
        return;
    }
    throw forbidden("Company membership or instance admin access required");
}
export function assertInstanceAdmin(req) {
    assertBoard(req);
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
        return;
    }
    throw forbidden("Instance admin access required");
}
export function assertCompanyAccess(req, companyId) {
    assertAuthenticated(req);
    if (req.actor.type === "agent" && req.actor.companyId !== companyId) {
        throw forbidden("Agent key cannot access another company");
    }
    if (req.actor.type === "board" && req.actor.source !== "local_implicit") {
        const allowedCompanies = req.actor.companyIds ?? [];
        if (!allowedCompanies.includes(companyId)) {
            throw forbidden("User does not have access to this company");
        }
        const method = typeof req.method === "string" ? req.method.toUpperCase() : "GET";
        const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(method);
        if (!isSafeMethod && !req.actor.isInstanceAdmin && Array.isArray(req.actor.memberships)) {
            const membership = req.actor.memberships.find((item) => item.companyId === companyId);
            if (!membership || membership.status !== "active") {
                throw forbidden("User does not have active company access");
            }
            if (membership.membershipRole === "viewer") {
                throw forbidden("Viewer access is read-only");
            }
        }
    }
}
export function getActorInfo(req) {
    assertAuthenticated(req);
    if (req.actor.type === "agent") {
        return {
            actorType: "agent",
            actorId: req.actor.agentId ?? "unknown-agent",
            agentId: req.actor.agentId ?? null,
            runId: req.actor.runId ?? null,
        };
    }
    return {
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        agentId: null,
        runId: req.actor.runId ?? null,
    };
}
//# sourceMappingURL=authz.js.map