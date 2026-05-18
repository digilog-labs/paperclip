export const RECOVERY_MODEL_PROFILE_KEY = "cheap";
export function withRecoveryModelProfileHint(input) {
    return {
        ...input,
        modelProfile: RECOVERY_MODEL_PROFILE_KEY,
    };
}
export function recoveryAssigneeAdapterOverrides() {
    return { modelProfile: RECOVERY_MODEL_PROFILE_KEY };
}
//# sourceMappingURL=model-profile-hint.js.map