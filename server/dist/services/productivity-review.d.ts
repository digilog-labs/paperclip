import type { Db } from "@paperclipai/db";
export declare const PRODUCTIVITY_REVIEW_ORIGIN_KIND: "issue_productivity_review";
export declare const DEFAULT_PRODUCTIVITY_REVIEW_NO_COMMENT_STREAK_RUNS = 10;
export declare const DEFAULT_PRODUCTIVITY_REVIEW_LONG_ACTIVE_HOURS = 6;
export declare const DEFAULT_PRODUCTIVITY_REVIEW_HIGH_CHURN_HOURLY = 10;
export declare const DEFAULT_PRODUCTIVITY_REVIEW_HIGH_CHURN_SIX_HOURS = 30;
export declare const DEFAULT_PRODUCTIVITY_REVIEW_RESOLVED_SNOOZE_MS: number;
export declare const DEFAULT_PRODUCTIVITY_REVIEW_REFRESH_INTERVAL_MS: number;
export declare const DEFAULT_PRODUCTIVITY_REVIEW_MAX_REFRESH_COMMENTS = 3;
export declare const DEFAULT_PRODUCTIVITY_REVIEW_CREATION_WINDOW_MS: number;
export declare const DEFAULT_PRODUCTIVITY_REVIEW_MAX_CREATIONS_PER_WINDOW = 3;
export declare const PRODUCTIVITY_REVIEW_REFRESH_COMMENT_PREFIX = "Productivity review evidence refreshed.";
type ProductivityReviewTrigger = "no_comment_streak" | "long_active_duration" | "high_churn";
type ProductivityReviewThresholds = {
    noCommentStreakRuns: number;
    longActiveMs: number;
    highChurnHourly: number;
    highChurnSixHours: number;
    resolvedSnoozeMs: number;
    refreshIntervalMs: number;
    maxRefreshComments: number;
    creationWindowMs: number;
    maxCreationsPerWindow: number;
};
type EnqueueWakeup = (agentId: string, opts?: {
    source?: "timer" | "assignment" | "on_demand" | "automation";
    triggerDetail?: "manual" | "ping" | "callback" | "system";
    reason?: string | null;
    payload?: Record<string, unknown> | null;
    requestedByActorType?: "user" | "agent" | "system";
    requestedByActorId?: string | null;
    contextSnapshot?: Record<string, unknown>;
}) => Promise<unknown | null>;
export declare function productivityReviewService(db: Db, deps?: {
    enqueueWakeup?: EnqueueWakeup;
}): {
    reconcileProductivityReviews: (opts?: {
        now?: Date;
        companyId?: string;
        thresholds?: Partial<ProductivityReviewThresholds>;
    }) => Promise<{
        scanned: number;
        created: number;
        updated: number;
        existing: number;
        snoozed: number;
        creationCapped: number;
        skipped: number;
        failed: number;
        reviewIssueIds: string[];
        failedIssueIds: string[];
    }>;
    isProductivityReviewContinuationHoldActive: (input: {
        companyId: string;
        issueId: string;
        agentId: string;
        now?: Date;
        thresholds?: Partial<ProductivityReviewThresholds>;
    }) => Promise<{
        held: false;
        reviewIssueId?: undefined;
        reviewIdentifier?: undefined;
        trigger?: undefined;
        reason?: undefined;
    } | {
        held: true;
        reviewIssueId: string;
        reviewIdentifier: string | null;
        trigger: "no_comment_streak" | "high_churn";
        reason: string;
    }>;
    recordContinuationHold: (input: {
        companyId: string;
        issueId: string;
        runId: string;
        agentId: string;
        reviewIssueId: string;
        trigger: ProductivityReviewTrigger;
        reason: string;
    }) => Promise<void>;
};
export {};
//# sourceMappingURL=productivity-review.d.ts.map