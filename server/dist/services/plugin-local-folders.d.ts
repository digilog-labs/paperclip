import type { PluginLocalFolderDeclaration, PluginLocalFolderListing, PluginLocalFolderStatus } from "@paperclipai/plugin-sdk";
export interface StoredPluginLocalFolderConfig {
    path: string;
    access?: "read" | "readWrite";
    requiredDirectories?: string[];
    requiredFiles?: string[];
    updatedAt?: string;
}
export interface PluginLocalFolderSettingsJson {
    localFolders?: Record<string, StoredPluginLocalFolderConfig>;
    [key: string]: unknown;
}
export declare function assertPluginLocalFolderKey(folderKey: string): void;
export declare function findLocalFolderDeclaration(declarations: PluginLocalFolderDeclaration[] | undefined, folderKey: string): PluginLocalFolderDeclaration | null;
export declare function requireLocalFolderDeclaration(declarations: PluginLocalFolderDeclaration[] | undefined, folderKey: string): PluginLocalFolderDeclaration;
export declare function getStoredLocalFolders(settingsJson: Record<string, unknown> | null | undefined): Record<string, StoredPluginLocalFolderConfig>;
export declare function setStoredLocalFolder(settingsJson: Record<string, unknown> | null | undefined, folderKey: string, config: StoredPluginLocalFolderConfig): PluginLocalFolderSettingsJson;
export declare function inspectPluginLocalFolder(input: {
    folderKey: string;
    declaration?: PluginLocalFolderDeclaration | null;
    storedConfig?: StoredPluginLocalFolderConfig | null;
    overrideConfig?: Partial<StoredPluginLocalFolderConfig>;
}): Promise<PluginLocalFolderStatus>;
export declare function preparePluginLocalFolder(input: {
    folderKey: string;
    declaration?: PluginLocalFolderDeclaration | null;
    storedConfig?: StoredPluginLocalFolderConfig | null;
    overrideConfig?: Partial<StoredPluginLocalFolderConfig>;
}): Promise<void>;
export declare function resolvePluginLocalFolderPath(rootPath: string, relativePath: string, options?: {
    mustExist?: boolean;
    allowMissingLeaf?: boolean;
}): Promise<{
    absolutePath: string;
    realPath: string;
    exists: boolean;
}>;
export declare function readPluginLocalFolderText(rootPath: string, relativePath: string): Promise<string>;
export declare function listPluginLocalFolderEntries(rootPath: string, options?: {
    relativePath?: string | null;
    recursive?: boolean;
    maxEntries?: number;
}): Promise<PluginLocalFolderListing>;
export declare function writePluginLocalFolderTextAtomic(rootPath: string, relativePath: string, contents: string): Promise<PluginLocalFolderStatus>;
export declare function deletePluginLocalFolderFile(rootPath: string, relativePath: string, folderKey: string): Promise<PluginLocalFolderStatus>;
export declare function defaultLocalFolderBasePath(pluginKey: string, companyId: string): string;
export declare function assertConfiguredLocalFolder(status: PluginLocalFolderStatus): void;
export declare function assertWritableConfiguredLocalFolder(status: PluginLocalFolderStatus): void;
//# sourceMappingURL=plugin-local-folders.d.ts.map