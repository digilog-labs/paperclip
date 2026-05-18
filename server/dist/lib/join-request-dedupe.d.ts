import { joinRequests } from "@paperclipai/db";
type JoinRequestLike = Pick<typeof joinRequests.$inferSelect, "id" | "requestType" | "status" | "requestingUserId" | "requestEmailSnapshot" | "createdAt" | "updatedAt">;
export declare function normalizeJoinRequestEmail(email: string | null | undefined): string | null;
export declare function humanJoinRequestIdentity(row: Pick<JoinRequestLike, "requestType" | "requestingUserId" | "requestEmailSnapshot">): string | null;
export declare function findReusableHumanJoinRequest<T extends Pick<JoinRequestLike, "id" | "requestType" | "status" | "requestingUserId" | "requestEmailSnapshot">>(rows: T[], actor: {
    requestingUserId?: string | null;
    requestEmailSnapshot?: string | null;
}): T | null;
export declare function collapseDuplicatePendingHumanJoinRequests<T extends Pick<JoinRequestLike, "id" | "requestType" | "status" | "requestingUserId" | "requestEmailSnapshot">>(rows: T[]): T[];
export {};
//# sourceMappingURL=join-request-dedupe.d.ts.map