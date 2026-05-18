function nonEmptyTrimmed(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
export function normalizeJoinRequestEmail(email) {
    const trimmed = nonEmptyTrimmed(email);
    return trimmed ? trimmed.toLowerCase() : null;
}
export function humanJoinRequestIdentity(row) {
    if (row.requestType !== "human")
        return null;
    const requestingUserId = nonEmptyTrimmed(row.requestingUserId);
    if (requestingUserId)
        return `user:${requestingUserId}`;
    const email = normalizeJoinRequestEmail(row.requestEmailSnapshot);
    return email ? `email:${email}` : null;
}
export function findReusableHumanJoinRequest(rows, actor) {
    const actorUserId = nonEmptyTrimmed(actor.requestingUserId);
    if (actorUserId) {
        const sameUser = rows.find((row) => row.requestType === "human" &&
            (row.status === "pending_approval" || row.status === "approved") &&
            row.requestingUserId === actorUserId);
        if (sameUser)
            return sameUser;
    }
    const actorEmail = normalizeJoinRequestEmail(actor.requestEmailSnapshot);
    if (!actorEmail)
        return null;
    return (rows.find((row) => row.requestType === "human" &&
        (row.status === "pending_approval" || row.status === "approved") &&
        normalizeJoinRequestEmail(row.requestEmailSnapshot) === actorEmail) ?? null);
}
export function collapseDuplicatePendingHumanJoinRequests(rows) {
    const seen = new Set();
    return rows.filter((row) => {
        if (row.requestType !== "human" || row.status !== "pending_approval") {
            return true;
        }
        const identity = humanJoinRequestIdentity(row);
        if (!identity)
            return true;
        if (seen.has(identity))
            return false;
        seen.add(identity);
        return true;
    });
}
//# sourceMappingURL=join-request-dedupe.js.map