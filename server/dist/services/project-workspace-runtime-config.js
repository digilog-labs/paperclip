function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cloneRecord(value) {
    return isRecord(value) ? { ...value } : null;
}
function readDesiredState(value) {
    return value === "running" || value === "stopped" || value === "manual" ? value : null;
}
function readServiceStates(value) {
    if (!isRecord(value))
        return null;
    const entries = Object.entries(value).filter(([, state]) => state === "running" || state === "stopped" || state === "manual");
    if (entries.length === 0)
        return null;
    return Object.fromEntries(entries);
}
export function readProjectWorkspaceRuntimeConfig(metadata) {
    const raw = isRecord(metadata?.runtimeConfig) ? metadata.runtimeConfig : null;
    if (!raw)
        return null;
    const config = {
        workspaceRuntime: cloneRecord(raw.workspaceRuntime),
        desiredState: readDesiredState(raw.desiredState),
        serviceStates: readServiceStates(raw.serviceStates),
    };
    const hasConfig = config.workspaceRuntime !== null || config.desiredState !== null || config.serviceStates !== null;
    return hasConfig ? config : null;
}
export function mergeProjectWorkspaceRuntimeConfig(metadata, patch) {
    const nextMetadata = isRecord(metadata) ? { ...metadata } : {};
    const current = readProjectWorkspaceRuntimeConfig(metadata) ?? {
        workspaceRuntime: null,
        desiredState: null,
        serviceStates: null,
    };
    if (patch === null) {
        delete nextMetadata.runtimeConfig;
        return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
    }
    const nextConfig = {
        workspaceRuntime: patch.workspaceRuntime !== undefined ? cloneRecord(patch.workspaceRuntime) : current.workspaceRuntime,
        desiredState: patch.desiredState !== undefined ? readDesiredState(patch.desiredState) : current.desiredState,
        serviceStates: patch.serviceStates !== undefined ? readServiceStates(patch.serviceStates) : current.serviceStates,
    };
    if (nextConfig.workspaceRuntime === null && nextConfig.desiredState === null && nextConfig.serviceStates === null) {
        delete nextMetadata.runtimeConfig;
    }
    else {
        nextMetadata.runtimeConfig = nextConfig;
    }
    return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
}
//# sourceMappingURL=project-workspace-runtime-config.js.map