import type { Db } from "@paperclipai/db";
import type { Environment, EnvironmentLease, EnvironmentLeaseStatus, ExecutionWorkspace, SandboxEnvironmentConfig } from "@paperclipai/shared";
import type { PluginEnvironmentExecuteResult, PluginEnvironmentLease, PluginEnvironmentRealizeWorkspaceResult } from "@paperclipai/plugin-sdk";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
export declare function buildEnvironmentLeaseContext(input: {
    persistedExecutionWorkspace: Pick<ExecutionWorkspace, "id" | "mode"> | null;
}): {
    executionWorkspaceId: string | null;
    executionWorkspaceMode: "adapter_managed" | "cloud_sandbox" | "shared_workspace" | "isolated_workspace" | "operator_branch" | null;
};
export interface EnvironmentDriverAcquireInput {
    companyId: string;
    environment: Environment;
    issueId: string | null;
    /**
     * UUID of the owning heartbeat run, or null for ad-hoc invocations
     * (e.g. operator-initiated `Test` probes) that are not tied to a run.
     * Null leases must be released by id via `getDriver(...).releaseRunLease`
     * since `releaseRunLeases(heartbeatRunId)` cannot find them.
     */
    heartbeatRunId: string | null;
    executionWorkspaceId: string | null;
    executionWorkspaceMode: ExecutionWorkspace["mode"] | null;
}
export interface EnvironmentDriverReleaseInput {
    environment: Environment;
    lease: EnvironmentLease;
    status: Extract<EnvironmentLeaseStatus, "released" | "expired" | "failed">;
}
export interface EnvironmentDriverLeaseInput {
    environment: Environment;
    lease: EnvironmentLease;
}
export interface EnvironmentDriverRealizeWorkspaceInput extends EnvironmentDriverLeaseInput {
    workspace: {
        localPath?: string;
        remotePath?: string;
        mode?: string;
        metadata?: Record<string, unknown>;
    };
}
export interface EnvironmentDriverExecuteInput extends EnvironmentDriverLeaseInput {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    stdin?: string;
    timeoutMs?: number;
}
export interface EnvironmentRuntimeDriver {
    readonly driver: string;
    acquireRunLease(input: EnvironmentDriverAcquireInput): Promise<EnvironmentLease>;
    releaseRunLease(input: EnvironmentDriverReleaseInput): Promise<EnvironmentLease | null>;
    resumeRunLease?(input: EnvironmentDriverLeaseInput): Promise<PluginEnvironmentLease | EnvironmentLease | null>;
    destroyRunLease?(input: EnvironmentDriverLeaseInput): Promise<EnvironmentLease | null>;
    realizeWorkspace?(input: EnvironmentDriverRealizeWorkspaceInput): Promise<PluginEnvironmentRealizeWorkspaceResult>;
    execute?(input: EnvironmentDriverExecuteInput): Promise<PluginEnvironmentExecuteResult>;
}
export interface EnvironmentRuntimeLeaseRecord {
    environment: Environment;
    lease: EnvironmentLease;
    leaseContext: ReturnType<typeof buildEnvironmentLeaseContext>;
}
export declare function findReusableSandboxLeaseId(input: {
    config: SandboxEnvironmentConfig;
    leases: Array<Pick<EnvironmentLease, "providerLeaseId" | "metadata">>;
}): string | null;
export declare function environmentRuntimeService(db: Db, options?: {
    drivers?: EnvironmentRuntimeDriver[];
    pluginWorkerManager?: PluginWorkerManager;
    pluginWorkerReadyTimeoutMs?: number;
    pluginWorkerReadyPollMs?: number;
}): {
    getDriver: (driverKey: string) => EnvironmentRuntimeDriver | null;
    acquireRunLease(input: {
        companyId: string;
        environment: Environment;
        issueId: string | null;
        /** Null for ad-hoc invocations (e.g. operator-initiated `Test` probes). */
        heartbeatRunId: string | null;
        persistedExecutionWorkspace: Pick<ExecutionWorkspace, "id" | "mode"> | null;
    }): Promise<EnvironmentRuntimeLeaseRecord>;
    releaseRunLeases(heartbeatRunId: string, status?: Extract<EnvironmentLeaseStatus, "released" | "expired" | "failed">): Promise<EnvironmentRuntimeLeaseRecord[]>;
    resumeRunLease(input: EnvironmentDriverLeaseInput): Promise<PluginEnvironmentLease | EnvironmentLease | null>;
    destroyRunLease(input: EnvironmentDriverLeaseInput): Promise<EnvironmentLease | null>;
    realizeWorkspace(input: EnvironmentDriverRealizeWorkspaceInput): Promise<PluginEnvironmentRealizeWorkspaceResult>;
    execute(input: EnvironmentDriverExecuteInput): Promise<PluginEnvironmentExecuteResult>;
};
export type EnvironmentRuntimeService = ReturnType<typeof environmentRuntimeService>;
//# sourceMappingURL=environment-runtime.d.ts.map