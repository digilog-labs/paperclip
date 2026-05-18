export declare const CURRENT_USER_REDACTION_TOKEN = "*";
export interface CurrentUserRedactionOptions {
    enabled?: boolean;
    replacement?: string;
    userNames?: string[];
    homeDirs?: string[];
}
export declare function maskUserNameForLogs(value: string, fallback?: string): string;
export declare function redactCurrentUserText(input: string, opts?: CurrentUserRedactionOptions): string;
export declare function redactCurrentUserValue<T>(value: T, opts?: CurrentUserRedactionOptions): T;
//# sourceMappingURL=log-redaction.d.ts.map