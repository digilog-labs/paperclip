import { forbidden } from "../errors.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function prefixPath(prefix, key) {
    return prefix.length > 0 ? `${prefix}.${key}` : key;
}
function collectWorkspaceStrategyCommandPaths(raw, prefix) {
    if (!isRecord(raw))
        return [];
    const paths = [];
    if (hasOwn(raw, "provisionCommand")) {
        paths.push(prefixPath(prefix, "provisionCommand"));
    }
    if (hasOwn(raw, "teardownCommand")) {
        paths.push(prefixPath(prefix, "teardownCommand"));
    }
    return paths;
}
function collectExecutionWorkspaceConfigCommandPaths(raw, prefix) {
    if (!isRecord(raw))
        return [];
    const paths = [];
    if (hasOwn(raw, "provisionCommand")) {
        paths.push(prefixPath(prefix, "provisionCommand"));
    }
    if (hasOwn(raw, "teardownCommand")) {
        paths.push(prefixPath(prefix, "teardownCommand"));
    }
    if (hasOwn(raw, "cleanupCommand")) {
        paths.push(prefixPath(prefix, "cleanupCommand"));
    }
    return paths;
}
export function assertNoAgentHostWorkspaceCommandMutation(req, paths) {
    if (req.actor.type !== "agent" || paths.length === 0)
        return;
    throw forbidden(`Agent keys cannot modify host-executed workspace commands (${paths.join(", ")}).`);
}
export function collectAgentAdapterWorkspaceCommandPaths(adapterConfig, prefix = "adapterConfig") {
    if (!isRecord(adapterConfig))
        return [];
    return collectWorkspaceStrategyCommandPaths(adapterConfig.workspaceStrategy, `${prefix}.workspaceStrategy`);
}
export function collectProjectExecutionWorkspaceCommandPaths(policy) {
    if (!isRecord(policy))
        return [];
    return collectWorkspaceStrategyCommandPaths(policy.workspaceStrategy, "executionWorkspacePolicy.workspaceStrategy");
}
export function collectProjectWorkspaceCommandPaths(workspacePatch, prefix = "") {
    if (!isRecord(workspacePatch))
        return [];
    return hasOwn(workspacePatch, "cleanupCommand")
        ? [prefixPath(prefix, "cleanupCommand")]
        : [];
}
export function collectIssueWorkspaceCommandPaths(input) {
    const paths = [];
    if (isRecord(input.executionWorkspaceSettings)) {
        paths.push(...collectWorkspaceStrategyCommandPaths(input.executionWorkspaceSettings.workspaceStrategy, "executionWorkspaceSettings.workspaceStrategy"));
    }
    if (isRecord(input.assigneeAdapterOverrides)) {
        const adapterConfig = input.assigneeAdapterOverrides.adapterConfig;
        if (isRecord(adapterConfig)) {
            paths.push(...collectWorkspaceStrategyCommandPaths(adapterConfig.workspaceStrategy, "assigneeAdapterOverrides.adapterConfig.workspaceStrategy"));
        }
    }
    return paths;
}
export function collectExecutionWorkspaceCommandPaths(input) {
    const paths = [];
    if (input.config !== undefined) {
        paths.push(...collectExecutionWorkspaceConfigCommandPaths(input.config, "config"));
    }
    if (isRecord(input.metadata) && hasOwn(input.metadata, "config")) {
        paths.push(...collectExecutionWorkspaceConfigCommandPaths(input.metadata.config, "metadata.config"));
    }
    return paths;
}
//# sourceMappingURL=workspace-command-authz.js.map