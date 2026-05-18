import type { Db } from "@paperclipai/db";
import { type FeedbackTargetType, type FeedbackTraceBundle, type FeedbackTrace, type FeedbackTraceStatus, type FeedbackVoteValue } from "@paperclipai/shared";
type FeedbackTraceShareClient = {
    uploadTraceBundle(bundle: FeedbackTraceBundle): Promise<{
        objectKey: string;
    }>;
};
type FeedbackServiceOptions = {
    shareClient?: FeedbackTraceShareClient;
};
export declare function feedbackService(db: Db, options?: FeedbackServiceOptions): {
    listIssueVotesForUser: (issueId: string, authorUserId: string) => Promise<{
        id: string;
        companyId: string;
        issueId: string;
        targetType: string;
        targetId: string;
        authorUserId: string;
        vote: string;
        reason: string | null;
        sharedWithLabs: boolean;
        sharedAt: Date | null;
        consentVersion: string | null;
        redactionSummary: unknown;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    listFeedbackTraces: (input: {
        companyId: string;
        issueId?: string;
        projectId?: string;
        targetType?: FeedbackTargetType;
        vote?: FeedbackVoteValue;
        status?: FeedbackTraceStatus;
        from?: Date;
        to?: Date;
        sharedOnly?: boolean;
        includePayload?: boolean;
    }) => Promise<FeedbackTrace[]>;
    getFeedbackTraceById: (traceId: string, includePayload?: boolean) => Promise<FeedbackTrace | null>;
    getFeedbackTraceBundle: (traceId: string) => Promise<FeedbackTraceBundle | null>;
    flushPendingFeedbackTraces: (input?: {
        companyId?: string;
        traceId?: string;
        limit?: number;
        now?: Date;
    }) => Promise<{
        attempted: number;
        sent: number;
        failed: number;
    }>;
    saveIssueVote: (input: {
        issueId: string;
        targetType: FeedbackTargetType;
        targetId: string;
        vote: FeedbackVoteValue;
        authorUserId: string;
        reason?: string | null;
        allowSharing?: boolean;
    }) => Promise<{
        vote: {
            redactionSummary: {
                strategy: string;
                redactedFields: string[];
                truncatedFields: string[];
                omittedFields: string[];
                notes: string[];
                counts: {
                    [k: string]: number;
                };
            };
            id: string;
            createdAt: Date;
            updatedAt: Date;
            companyId: string;
            reason: string | null;
            issueId: string;
            targetType: string;
            targetId: string;
            vote: string;
            authorUserId: string;
            sharedWithLabs: boolean;
            sharedAt: Date | null;
            consentVersion: string | null;
        };
        traceId: string;
        consentEnabledNow: boolean;
        persistedSharingPreference: "allowed" | "not_allowed" | null;
        sharingEnabled: boolean;
    }>;
};
export {};
//# sourceMappingURL=feedback.d.ts.map