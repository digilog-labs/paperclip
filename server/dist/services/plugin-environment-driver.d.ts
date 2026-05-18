import type { Db } from "@paperclipai/db";
import type { EnvironmentProbeResult, PluginEnvironmentConfig, PluginEnvironmentDriverDeclaration } from "@paperclipai/shared";
import type { PluginEnvironmentExecuteParams, PluginEnvironmentExecuteResult, PluginEnvironmentLease, PluginEnvironmentRealizeWorkspaceParams, PluginEnvironmentRealizeWorkspaceResult } from "@paperclipai/plugin-sdk";
import { pluginRegistryService } from "./plugin-registry.js";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
export declare function pluginDriverProviderKey(config: Pick<PluginEnvironmentConfig, "pluginKey" | "driverKey">): string;
export declare function resolvePluginEnvironmentDriver(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    config: PluginEnvironmentConfig;
}): Promise<{
    plugin: {
        id: string;
        pluginKey: string;
        packageName: string;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        manifestJson: import("@paperclipai/shared").PaperclipPluginManifestV1;
        status: "error" | "ready" | "disabled" | "installed" | "upgrade_pending" | "uninstalled";
        installOrder: number | null;
        packagePath: string | null;
        lastError: string | null;
        installedAt: Date;
        updatedAt: Date;
    };
    driver: PluginEnvironmentDriverDeclaration;
}>;
export declare function resolvePluginEnvironmentDriverByKey(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    driverKey: string;
}): Promise<{
    plugin: Awaited<ReturnType<ReturnType<typeof pluginRegistryService>["list"]>>[number];
    driver: PluginEnvironmentDriverDeclaration;
} | null>;
export declare function resolvePluginSandboxProviderDriverByKey(input: {
    db: Db;
    driverKey: string;
    workerManager?: PluginWorkerManager;
    requireRunning?: boolean;
}): Promise<{
    plugin: Awaited<ReturnType<ReturnType<typeof pluginRegistryService>["list"]>>[number];
    driver: PluginEnvironmentDriverDeclaration;
} | null>;
export declare function listReadyPluginEnvironmentDrivers(input: {
    db: Db;
    workerManager?: PluginWorkerManager;
}): Promise<{
    pluginId: string;
    pluginKey: string;
    driverKey: string;
    displayName: string;
    description: string | undefined;
    configSchema: import("@paperclipai/shared").JsonSchema;
}[]>;
export declare function validatePluginSandboxProviderConfig(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    provider: string;
    config: Record<string, unknown>;
}): Promise<{
    normalizedConfig: Record<string, unknown>;
    pluginId: string;
    pluginKey: string;
    driver: PluginEnvironmentDriverDeclaration;
}>;
export declare function validatePluginEnvironmentDriverConfig(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    config: PluginEnvironmentConfig;
}): Promise<PluginEnvironmentConfig>;
export declare function probePluginEnvironmentDriver(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    companyId: string;
    environmentId: string;
    config: PluginEnvironmentConfig;
}): Promise<EnvironmentProbeResult>;
export declare function probePluginSandboxProviderDriver(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    companyId: string;
    environmentId: string;
    provider: string;
    config: Record<string, unknown>;
}): Promise<EnvironmentProbeResult>;
export declare function resumePluginEnvironmentLease(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    companyId: string;
    environmentId: string;
    issueId?: string | null;
    config: PluginEnvironmentConfig;
    providerLeaseId: string;
    leaseMetadata?: Record<string, unknown>;
}): Promise<PluginEnvironmentLease>;
export declare function destroyPluginEnvironmentLease(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    companyId: string;
    environmentId: string;
    issueId?: string | null;
    config: PluginEnvironmentConfig;
    providerLeaseId: string | null;
    leaseMetadata?: Record<string, unknown>;
}): Promise<void>;
export declare function realizePluginEnvironmentWorkspace(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    pluginId?: string | null;
    params: PluginEnvironmentRealizeWorkspaceParams;
    config: PluginEnvironmentConfig;
}): Promise<PluginEnvironmentRealizeWorkspaceResult>;
export declare function executePluginEnvironmentCommand(input: {
    db: Db;
    workerManager: PluginWorkerManager;
    pluginId?: string | null;
    params: PluginEnvironmentExecuteParams;
    config: PluginEnvironmentConfig;
}): Promise<PluginEnvironmentExecuteResult>;
export declare function resolvePluginExecuteRpcTimeoutMs(input: {
    requestedTimeoutMs?: number;
    config: Record<string, unknown>;
}): number | undefined;
//# sourceMappingURL=plugin-environment-driver.d.ts.map