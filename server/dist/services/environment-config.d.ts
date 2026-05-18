import type { Db } from "@paperclipai/db";
import type { Environment, EnvironmentDriver, LocalEnvironmentConfig, PluginEnvironmentConfig, SandboxEnvironmentConfig, SecretProvider, SecretVersionSelector, SshEnvironmentConfig } from "@paperclipai/shared";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
export type ParsedEnvironmentConfig = {
    driver: "local";
    config: LocalEnvironmentConfig;
} | {
    driver: "ssh";
    config: SshEnvironmentConfig;
} | {
    driver: "sandbox";
    config: SandboxEnvironmentConfig;
} | {
    driver: "plugin";
    config: PluginEnvironmentConfig;
};
export declare function collectEnvironmentSecretRefs(input: {
    db: Db;
    environment: Pick<Environment, "id" | "driver" | "config">;
}): Promise<Array<{
    secretId: string;
    configPath: string;
    versionSelector?: SecretVersionSelector;
}>>;
export declare function stripSandboxProviderEnvelope(config: SandboxEnvironmentConfig): Record<string, unknown>;
export declare function normalizeEnvironmentConfig(input: {
    driver: EnvironmentDriver;
    config: Record<string, unknown> | null | undefined;
}): Record<string, unknown>;
export declare function normalizeEnvironmentConfigForProbe(input: {
    db: Db;
    driver: EnvironmentDriver;
    config: Record<string, unknown> | null | undefined;
    pluginWorkerManager?: PluginWorkerManager;
}): Promise<Record<string, unknown>> | Record<string, unknown>;
export declare function normalizeEnvironmentConfigForPersistence(input: {
    db: Db;
    companyId: string;
    environmentName: string;
    driver: EnvironmentDriver;
    secretProvider: SecretProvider;
    config: Record<string, unknown> | null | undefined;
    actor?: {
        userId?: string | null;
        agentId?: string | null;
    };
    pluginWorkerManager?: PluginWorkerManager;
}): Promise<Record<string, unknown>>;
export declare function resolveEnvironmentDriverConfigForRuntime(db: Db, companyId: string, environment: Pick<Environment, "driver" | "config"> & Partial<Pick<Environment, "id">>, context?: {
    issueId?: string | null;
    heartbeatRunId?: string | null;
}): Promise<ParsedEnvironmentConfig>;
export declare function readSshEnvironmentPrivateKeySecretId(environment: Pick<Environment, "driver" | "config">): string | null;
export declare function parseEnvironmentDriverConfig(environment: Pick<Environment, "driver" | "config">): ParsedEnvironmentConfig;
//# sourceMappingURL=environment-config.d.ts.map