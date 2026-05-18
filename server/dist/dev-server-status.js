import { existsSync, readFileSync, statSync } from "node:fs";
const MAX_PERSISTED_DEV_SERVER_STATUS_BYTES = 64 * 1024;
function normalizeStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}
function normalizeTimestamp(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
export function readPersistedDevServerStatus(env = process.env) {
    const filePath = env.PAPERCLIP_DEV_SERVER_STATUS_FILE?.trim();
    if (!filePath || !existsSync(filePath))
        return null;
    try {
        if (statSync(filePath).size > MAX_PERSISTED_DEV_SERVER_STATUS_BYTES) {
            return null;
        }
        const raw = JSON.parse(readFileSync(filePath, "utf8"));
        const changedPathsSample = normalizeStringArray(raw.changedPathsSample).slice(0, 5);
        const pendingMigrations = normalizeStringArray(raw.pendingMigrations);
        const changedPathCountRaw = raw.changedPathCount;
        const changedPathCount = typeof changedPathCountRaw === "number" && Number.isFinite(changedPathCountRaw)
            ? Math.max(0, Math.trunc(changedPathCountRaw))
            : changedPathsSample.length;
        const dirtyRaw = raw.dirty;
        const dirty = typeof dirtyRaw === "boolean"
            ? dirtyRaw
            : changedPathCount > 0 || pendingMigrations.length > 0;
        return {
            dirty,
            lastChangedAt: normalizeTimestamp(raw.lastChangedAt),
            changedPathCount,
            changedPathsSample,
            pendingMigrations,
            lastRestartAt: normalizeTimestamp(raw.lastRestartAt),
        };
    }
    catch {
        return null;
    }
}
export function toDevServerHealthStatus(persisted, opts) {
    const hasPathChanges = persisted.changedPathCount > 0;
    const hasPendingMigrations = persisted.pendingMigrations.length > 0;
    const reason = hasPathChanges && hasPendingMigrations
        ? "backend_changes_and_pending_migrations"
        : hasPendingMigrations
            ? "pending_migrations"
            : hasPathChanges
                ? "backend_changes"
                : null;
    const restartRequired = persisted.dirty || reason !== null;
    return {
        enabled: true,
        restartRequired,
        reason,
        lastChangedAt: persisted.lastChangedAt,
        changedPathCount: persisted.changedPathCount,
        changedPathsSample: persisted.changedPathsSample,
        pendingMigrations: persisted.pendingMigrations,
        autoRestartEnabled: opts.autoRestartEnabled,
        activeRunCount: opts.activeRunCount,
        waitingForIdle: restartRequired && opts.autoRestartEnabled && opts.activeRunCount > 0,
        lastRestartAt: persisted.lastRestartAt,
    };
}
//# sourceMappingURL=dev-server-status.js.map