/**
 * External adapter plugin loader.
 *
 * Loads external adapter packages from the adapter-plugin-store and returns
 * their ServerAdapterModule instances. The caller (registry.ts) is
 * responsible for registering them.
 *
 * This avoids circular initialization: plugin-loader imports only
 * adapter-utils, never registry.ts.
 */
import type { ServerAdapterModule } from "./types.js";
export declare function getUiParserSource(adapterType: string): string | undefined;
/**
 * On cache miss, attempt on-demand extraction from the plugin store.
 * Makes the ui-parser.js endpoint self-healing.
 */
export declare function getOrExtractUiParserSource(adapterType: string): string | undefined;
export declare function loadExternalAdapterPackage(packageName: string, localPath?: string): Promise<ServerAdapterModule>;
/**
 * Reload an external adapter at runtime (dev iteration without server restart).
 * Busts the ESM module cache via a cache-busting query string.
 */
export declare function reloadExternalAdapter(type: string): Promise<ServerAdapterModule | null>;
/**
 * Build all external adapter modules from the plugin store.
 */
export declare function buildExternalAdapters(): Promise<ServerAdapterModule[]>;
//# sourceMappingURL=plugin-loader.d.ts.map