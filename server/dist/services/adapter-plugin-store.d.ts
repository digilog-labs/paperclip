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
export interface AdapterPluginRecord {
    /** npm package name (e.g., "droid-paperclip-adapter") */
    packageName: string;
    /** Absolute local filesystem path (for locally linked adapters) */
    localPath?: string;
    /** Installed version string (for npm packages) */
    version?: string;
    /** Adapter type identifier (matches ServerAdapterModule.type) */
    type: string;
    /** ISO 8601 timestamp of when the adapter was installed */
    installedAt: string;
    /** Whether this adapter is disabled (hidden from menus but still functional) */
    disabled?: boolean;
}
export declare function listAdapterPlugins(): AdapterPluginRecord[];
export declare function addAdapterPlugin(record: AdapterPluginRecord): void;
export declare function removeAdapterPlugin(type: string): boolean;
export declare function getAdapterPluginByType(type: string): AdapterPluginRecord | undefined;
export declare function getAdapterPluginsDir(): string;
export declare function getDisabledAdapterTypes(): string[];
export declare function isAdapterDisabled(type: string): boolean;
export declare function setAdapterDisabled(type: string, disabled: boolean): boolean;
//# sourceMappingURL=adapter-plugin-store.d.ts.map