export declare const RECOVERY_MODEL_PROFILE_KEY: "cheap";
export declare function withRecoveryModelProfileHint<T extends Record<string, unknown>>(input: T): T & {
    modelProfile: typeof RECOVERY_MODEL_PROFILE_KEY;
};
export declare function recoveryAssigneeAdapterOverrides(): {
    modelProfile: "cheap";
};
//# sourceMappingURL=model-profile-hint.d.ts.map