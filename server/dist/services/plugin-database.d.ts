import type { Db } from "@paperclipai/db";
import type { PaperclipPluginManifestV1, PluginDatabaseCoreReadTable } from "@paperclipai/shared";
export type PluginDatabaseRuntimeResult<T = Record<string, unknown>> = {
    rows?: T[];
    rowCount?: number;
};
export declare function derivePluginDatabaseNamespace(pluginKey: string, namespaceSlug?: string): string;
export declare function validatePluginMigrationStatement(statement: string, namespace: string, coreReadTables?: readonly PluginDatabaseCoreReadTable[]): void;
export declare function validatePluginRuntimeQuery(query: string, namespace: string, coreReadTables?: readonly PluginDatabaseCoreReadTable[]): void;
export declare function validatePluginRuntimeExecute(query: string, namespace: string): void;
type PluginDatabaseClient = Pick<Db, "select" | "insert" | "update" | "execute">;
type PluginDatabaseRootClient = PluginDatabaseClient & Partial<Pick<Db, "transaction">>;
export interface ApplyPluginMigrationsOptions {
    /**
     * Persist failed migration ledger rows. Fresh install uses false because the
     * caller owns a larger transaction and must roll back the plugin row and
     * namespace together.
     */
    persistFailure?: boolean;
}
export declare function pluginDatabaseService(db: PluginDatabaseRootClient): {
    ensureNamespace: (pluginId: string, manifest: PaperclipPluginManifestV1) => Promise<{
        id: string;
        status: "active" | "migration_failed";
        createdAt: Date;
        updatedAt: Date;
        pluginKey: string;
        pluginId: string;
        namespaceName: string;
        namespaceMode: "schema";
    } | null>;
    applyMigrations(pluginId: string, manifest: PaperclipPluginManifestV1, packageRoot: string, options?: ApplyPluginMigrationsOptions): Promise<{
        id: string;
        status: "active" | "migration_failed";
        createdAt: Date;
        updatedAt: Date;
        pluginKey: string;
        pluginId: string;
        namespaceName: string;
        namespaceMode: "schema";
    } | null>;
    getRuntimeNamespace: (pluginId: string) => Promise<string>;
    query<T = Record<string, unknown>>(pluginId: string, statement: string, params?: unknown[]): Promise<T[]>;
    execute(pluginId: string, statement: string, params?: unknown[]): Promise<{
        rowCount: number;
    }>;
};
export {};
//# sourceMappingURL=plugin-database.d.ts.map