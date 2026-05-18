export type FeedbackRedactionState = {
    redactedFields: Set<string>;
    truncatedFields: Set<string>;
    omittedFields: Set<string>;
    notes: Set<string>;
    counts: Map<string, number>;
};
export declare function createFeedbackRedactionState(): FeedbackRedactionState;
export declare function sanitizeFeedbackText(input: string, state: FeedbackRedactionState, fieldPath: string, maxLength: number): string;
export declare function sanitizeFeedbackValue(value: unknown, state: FeedbackRedactionState, fieldPath: string, maxStringLength: number): unknown;
export declare function finalizeFeedbackRedactionSummary(state: FeedbackRedactionState): {
    strategy: string;
    redactedFields: string[];
    truncatedFields: string[];
    omittedFields: string[];
    notes: string[];
    counts: {
        [k: string]: number;
    };
};
export declare function stableStringify(value: unknown): string;
export declare function sha256Digest(value: unknown): string;
//# sourceMappingURL=feedback-redaction.d.ts.map