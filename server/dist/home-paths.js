import path from "node:path";
const PATH_SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;
const FRIENDLY_PATH_SEGMENT_RE = /[^a-zA-Z0-9._-]+/g;
import { expandHomePrefix, resolveDefaultBackupDir as resolveSharedDefaultBackupDir, resolveDefaultEmbeddedPostgresDir as resolveSharedDefaultEmbeddedPostgresDir, resolveDefaultLogsDir as resolveSharedDefaultLogsDir, resolveDefaultSecretsKeyFilePath as resolveSharedDefaultSecretsKeyFilePath, resolveDefaultStorageDir as resolveSharedDefaultStorageDir, resolveHomeAwarePath, resolvePaperclipConfigPathForInstance, resolvePaperclipHomeDir, resolvePaperclipInstanceId, resolvePaperclipInstanceRoot, } from "@paperclipai/shared/home-paths";
export { expandHomePrefix, resolveHomeAwarePath, resolvePaperclipHomeDir, resolvePaperclipInstanceId, resolvePaperclipInstanceRoot, };
export function resolveDefaultConfigPath() {
    return resolvePaperclipConfigPathForInstance();
}
export function resolveDefaultEmbeddedPostgresDir() {
    return resolveSharedDefaultEmbeddedPostgresDir();
}
export function resolveDefaultLogsDir() {
    return resolveSharedDefaultLogsDir();
}
export function resolveDefaultSecretsKeyFilePath() {
    return resolveSharedDefaultSecretsKeyFilePath();
}
export function resolveDefaultStorageDir() {
    return resolveSharedDefaultStorageDir();
}
export function resolveDefaultBackupDir() {
    return resolveSharedDefaultBackupDir();
}
export function resolveDefaultAgentWorkspaceDir(agentId) {
    const trimmed = agentId.trim();
    if (!PATH_SEGMENT_RE.test(trimmed)) {
        throw new Error(`Invalid agent id for workspace path '${agentId}'.`);
    }
    return path.resolve(resolvePaperclipInstanceRoot(), "workspaces", trimmed);
}
function sanitizeFriendlyPathSegment(value, fallback = "_default") {
    const trimmed = value?.trim() ?? "";
    if (!trimmed)
        return fallback;
    const sanitized = trimmed
        .replace(FRIENDLY_PATH_SEGMENT_RE, "-")
        .replace(/^-+|-+$/g, "");
    return sanitized || fallback;
}
export function resolveManagedProjectWorkspaceDir(input) {
    const companyId = input.companyId.trim();
    const projectId = input.projectId.trim();
    if (!companyId || !projectId) {
        throw new Error("Managed project workspace path requires companyId and projectId.");
    }
    return path.resolve(resolvePaperclipInstanceRoot(), "projects", sanitizeFriendlyPathSegment(companyId, "company"), sanitizeFriendlyPathSegment(projectId, "project"), sanitizeFriendlyPathSegment(input.repoName, "_default"));
}
//# sourceMappingURL=home-paths.js.map