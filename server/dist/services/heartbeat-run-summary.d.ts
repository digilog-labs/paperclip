export declare const HEARTBEAT_RUN_RESULT_SUMMARY_MAX_CHARS = 500;
export declare const HEARTBEAT_RUN_RESULT_OUTPUT_MAX_CHARS = 4096;
export declare const HEARTBEAT_RUN_SAFE_RESULT_JSON_MAX_BYTES: number;
export declare function mergeHeartbeatRunResultJson(resultJson: Record<string, unknown> | null | undefined, summary: string | null | undefined): Record<string, unknown> | null;
export declare function summarizeHeartbeatRunResultJson(resultJson: Record<string, unknown> | null | undefined): Record<string, unknown> | null;
export declare function buildHeartbeatRunIssueComment(resultJson: Record<string, unknown> | null | undefined): string | null;
//# sourceMappingURL=heartbeat-run-summary.d.ts.map