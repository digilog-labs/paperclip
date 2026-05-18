import type { Db } from "@paperclipai/db";
export declare const BOARD_API_KEY_TTL_MS: number;
export declare const CLI_AUTH_CHALLENGE_TTL_MS: number;
export type CliAuthChallengeStatus = "pending" | "approved" | "cancelled" | "expired";
export declare function hashBearerToken(token: string): string;
export declare function tokenHashesMatch(left: string, right: string): boolean;
export declare function createBoardApiToken(): string;
export declare function createCliAuthSecret(): string;
export declare function boardApiKeyExpiresAt(nowMs?: number): Date;
export declare function cliAuthChallengeExpiresAt(nowMs?: number): Date;
export declare function boardAuthService(db: Db): {
    resolveBoardAccess: (userId: string) => Promise<{
        user: {
            id: string;
            name: string;
            email: string;
        };
        companyIds: string[];
        memberships: {
            companyId: string;
            membershipRole: string | null;
            status: string;
        }[];
        isInstanceAdmin: boolean;
    }>;
    findBoardApiKeyByToken: (token: string) => Promise<{
        id: string;
        userId: string;
        name: string;
        keyHash: string;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
        expiresAt: Date | null;
        createdAt: Date;
    } | null>;
    touchBoardApiKey: (id: string) => Promise<void>;
    revokeBoardApiKey: (id: string) => Promise<{
        id: string;
        userId: string;
        name: string;
        keyHash: string;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
        expiresAt: Date | null;
        createdAt: Date;
    }>;
    createCliAuthChallenge: (input: {
        command: string;
        clientName?: string | null;
        requestedAccess: "board" | "instance_admin_required";
        requestedCompanyId?: string | null;
    }) => Promise<{
        challenge: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            expiresAt: Date;
            secretHash: string;
            command: string;
            clientName: string | null;
            requestedAccess: string;
            requestedCompanyId: string | null;
            pendingKeyHash: string;
            pendingKeyName: string;
            approvedByUserId: string | null;
            boardApiKeyId: string | null;
            approvedAt: Date | null;
            cancelledAt: Date | null;
        };
        challengeSecret: string;
        pendingBoardToken: string;
    }>;
    getCliAuthChallengeBySecret: (id: string, token: string) => Promise<{
        id: string;
        secretHash: string;
        command: string;
        clientName: string | null;
        requestedAccess: string;
        requestedCompanyId: string | null;
        pendingKeyHash: string;
        pendingKeyName: string;
        approvedByUserId: string | null;
        boardApiKeyId: string | null;
        approvedAt: Date | null;
        cancelledAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    describeCliAuthChallenge: (id: string, token: string) => Promise<{
        id: string;
        status: CliAuthChallengeStatus;
        command: string;
        clientName: string | null;
        requestedAccess: "board" | "instance_admin_required";
        requestedCompanyId: string | null;
        requestedCompanyName: string | null;
        approvedAt: string | null;
        cancelledAt: string | null;
        expiresAt: string;
        approvedByUser: {
            id: string;
            name: string;
            email: string;
        } | null;
    } | null>;
    approveCliAuthChallenge: (id: string, token: string, userId: string) => Promise<{
        status: "expired";
        challenge: {
            id: string;
            secretHash: string;
            command: string;
            clientName: string | null;
            requestedAccess: string;
            requestedCompanyId: string | null;
            pendingKeyHash: string;
            pendingKeyName: string;
            approvedByUserId: string | null;
            boardApiKeyId: string | null;
            approvedAt: Date | null;
            cancelledAt: Date | null;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
        };
    } | {
        status: "cancelled";
        challenge: {
            id: string;
            secretHash: string;
            command: string;
            clientName: string | null;
            requestedAccess: string;
            requestedCompanyId: string | null;
            pendingKeyHash: string;
            pendingKeyName: string;
            approvedByUserId: string | null;
            boardApiKeyId: string | null;
            approvedAt: Date | null;
            cancelledAt: Date | null;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
        };
    } | {
        status: "approved";
        challenge: {
            id: string;
            secretHash: string;
            command: string;
            clientName: string | null;
            requestedAccess: string;
            requestedCompanyId: string | null;
            pendingKeyHash: string;
            pendingKeyName: string;
            approvedByUserId: string | null;
            boardApiKeyId: string | null;
            approvedAt: Date | null;
            cancelledAt: Date | null;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    cancelCliAuthChallenge: (id: string, token: string) => Promise<{
        status: "approved";
        challenge: {
            id: string;
            secretHash: string;
            command: string;
            clientName: string | null;
            requestedAccess: string;
            requestedCompanyId: string | null;
            pendingKeyHash: string;
            pendingKeyName: string;
            approvedByUserId: string | null;
            boardApiKeyId: string | null;
            approvedAt: Date | null;
            cancelledAt: Date | null;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
        };
    } | {
        status: "expired";
        challenge: {
            id: string;
            secretHash: string;
            command: string;
            clientName: string | null;
            requestedAccess: string;
            requestedCompanyId: string | null;
            pendingKeyHash: string;
            pendingKeyName: string;
            approvedByUserId: string | null;
            boardApiKeyId: string | null;
            approvedAt: Date | null;
            cancelledAt: Date | null;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
        };
    } | {
        status: "cancelled";
        challenge: {
            id: string;
            secretHash: string;
            command: string;
            clientName: string | null;
            requestedAccess: string;
            requestedCompanyId: string | null;
            pendingKeyHash: string;
            pendingKeyName: string;
            approvedByUserId: string | null;
            boardApiKeyId: string | null;
            approvedAt: Date | null;
            cancelledAt: Date | null;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    assertCurrentBoardKey: (keyId: string | undefined, userId: string | undefined) => Promise<{
        id: string;
        userId: string;
        name: string;
        keyHash: string;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
        expiresAt: Date | null;
        createdAt: Date;
    }>;
    resolveBoardActivityCompanyIds: (input: {
        userId: string;
        requestedCompanyId?: string | null;
        boardApiKeyId?: string | null;
    }) => Promise<string[]>;
};
//# sourceMappingURL=board-auth.d.ts.map