export type HeartbeatRunOutcome = "succeeded" | "failed" | "cancelled" | "timed_out";
export type HeartbeatRunStopReason = "completed" | "timeout" | "cancelled" | "budget_paused" | "paused" | "max_turns_exhausted" | "process_lost" | "adapter_failed";
export interface HeartbeatRunTimeoutPolicy {
    effectiveTimeoutSec: number | null;
    effectiveTimeoutMs?: number | null;
    timeoutConfigured: boolean;
    timeoutSource: "config" | "default" | "unknown";
}
export interface HeartbeatRunStopMetadata extends HeartbeatRunTimeoutPolicy {
    stopReason: HeartbeatRunStopReason;
    timeoutFired: boolean;
}
export declare function normalizeMaxTurnStopReason(value: unknown): Extract<HeartbeatRunStopReason, "max_turns_exhausted"> | null;
export declare function resolveHeartbeatRunTimeoutPolicy(adapterType: string, adapterConfig: Record<string, unknown> | null | undefined): HeartbeatRunTimeoutPolicy;
export declare function inferHeartbeatRunStopReason(input: {
    outcome: HeartbeatRunOutcome;
    errorCode?: string | null;
    errorMessage?: string | null;
}): HeartbeatRunStopReason;
export declare function buildHeartbeatRunStopMetadata(input: {
    adapterType: string;
    adapterConfig: Record<string, unknown> | null | undefined;
    outcome: HeartbeatRunOutcome;
    errorCode?: string | null;
    errorMessage?: string | null;
}): HeartbeatRunStopMetadata;
export declare function mergeHeartbeatRunStopMetadata(resultJson: Record<string, unknown> | null | undefined, metadata: HeartbeatRunStopMetadata): Record<string, unknown>;
//# sourceMappingURL=heartbeat-stop-metadata.d.ts.map