/**
 * JSON-file-backed store for external adapter registrations.
 *
 * Stores metadata about externally installed adapter packages at
 * ~/.paperclip/adapter-plugins.json. This is the source of truth for which
 * external adapters should be loaded at startup.
 *
 * Both the plugin store and the settings store are cached in memory after
 * the first read. Writes invalidate the cache so the next read picks up
 * the new state without a redundant disk round-trip.
 *
 * @module server/services/adapter-plugin-store
 */
import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../home-paths.js";
// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
function adapterPluginPaths() {
    const paperclipDir = resolvePaperclipHomeDir();
    return {
        adapterPluginsDir: path.join(paperclipDir, "adapter-plugins"),
        adapterPluginsStorePath: path.join(paperclipDir, "adapter-plugins.json"),
        adapterSettingsPath: path.join(paperclipDir, "adapter-settings.json"),
    };
}
// ---------------------------------------------------------------------------
// In-memory caches (invalidated on write)
// ---------------------------------------------------------------------------
let storeCache = null;
let settingsCache = null;
// ---------------------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------------------
function ensureDirs() {
    const { adapterPluginsDir } = adapterPluginPaths();
    fs.mkdirSync(adapterPluginsDir, { recursive: true });
    const pkgJsonPath = path.join(adapterPluginsDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify({
            name: "paperclip-adapter-plugins",
            version: "0.0.0",
            private: true,
            description: "Managed directory for Paperclip external adapter plugins. Do not edit manually.",
        }, null, 2) + "\n");
    }
    return adapterPluginsDir;
}
function readStore() {
    const { adapterPluginsStorePath } = adapterPluginPaths();
    if (storeCache?.path === adapterPluginsStorePath)
        return storeCache.records;
    try {
        const raw = fs.readFileSync(adapterPluginsStorePath, "utf-8");
        const parsed = JSON.parse(raw);
        storeCache = {
            path: adapterPluginsStorePath,
            records: Array.isArray(parsed) ? parsed : [],
        };
    }
    catch {
        storeCache = { path: adapterPluginsStorePath, records: [] };
    }
    return storeCache.records;
}
function writeStore(records) {
    ensureDirs();
    const { adapterPluginsStorePath } = adapterPluginPaths();
    fs.writeFileSync(adapterPluginsStorePath, JSON.stringify(records, null, 2), "utf-8");
    storeCache = { path: adapterPluginsStorePath, records };
}
function readSettings() {
    const { adapterSettingsPath } = adapterPluginPaths();
    if (settingsCache?.path === adapterSettingsPath)
        return settingsCache.settings;
    try {
        const raw = fs.readFileSync(adapterSettingsPath, "utf-8");
        const parsed = JSON.parse(raw);
        settingsCache = {
            path: adapterSettingsPath,
            settings: parsed && Array.isArray(parsed.disabledTypes)
                ? parsed
                : { disabledTypes: [] },
        };
    }
    catch {
        settingsCache = { path: adapterSettingsPath, settings: { disabledTypes: [] } };
    }
    return settingsCache.settings;
}
function writeSettings(settings) {
    ensureDirs();
    const { adapterSettingsPath } = adapterPluginPaths();
    fs.writeFileSync(adapterSettingsPath, JSON.stringify(settings, null, 2), "utf-8");
    settingsCache = { path: adapterSettingsPath, settings };
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function listAdapterPlugins() {
    return readStore();
}
export function addAdapterPlugin(record) {
    const store = [...readStore()];
    const idx = store.findIndex((r) => r.type === record.type);
    if (idx >= 0) {
        store[idx] = record;
    }
    else {
        store.push(record);
    }
    writeStore(store);
}
export function removeAdapterPlugin(type) {
    const store = [...readStore()];
    const idx = store.findIndex((r) => r.type === type);
    if (idx < 0)
        return false;
    store.splice(idx, 1);
    writeStore(store);
    return true;
}
export function getAdapterPluginByType(type) {
    return readStore().find((r) => r.type === type);
}
export function getAdapterPluginsDir() {
    return ensureDirs();
}
// ---------------------------------------------------------------------------
// Adapter enable/disable (settings)
// ---------------------------------------------------------------------------
export function getDisabledAdapterTypes() {
    return readSettings().disabledTypes;
}
export function isAdapterDisabled(type) {
    return readSettings().disabledTypes.includes(type);
}
export function setAdapterDisabled(type, disabled) {
    const settings = { ...readSettings(), disabledTypes: [...readSettings().disabledTypes] };
    const idx = settings.disabledTypes.indexOf(type);
    if (disabled && idx < 0) {
        settings.disabledTypes.push(type);
        writeSettings(settings);
        return true;
    }
    if (!disabled && idx >= 0) {
        settings.disabledTypes.splice(idx, 1);
        writeSettings(settings);
        return true;
    }
    return false;
}
//# sourceMappingURL=adapter-plugin-store.js.map