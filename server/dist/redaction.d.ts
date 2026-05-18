export declare const REDACTED_EVENT_VALUE = "***REDACTED***";
export declare function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown>;
export declare function redactEventPayload(payload: Record<string, unknown> | null): Record<string, unknown> | null;
export declare function redactSensitiveText(input: string): string;
//# sourceMappingURL=redaction.d.ts.map