/**
 * Centralized environment run orchestrator.
 *
 * Owns the full environment lifecycle for a heartbeat run:
 *   1. Resolve selected environment
 *   2. Validate environment is active and allowed
 *   3. Acquire or resume lease
 *   4. Realize workspace in the environment
 *   5. Resolve execution target for the adapter
 *   6. Release / retain / fail lease according to policy
 *   7. Record activity and operator-visible status
 *
 * Heartbeat callers delegate to this service instead of inlining
 * environment resolution, lease management, workspace realization,
 * and transport logic.
 */
import type { Db } from "@paperclipai/db";
import type { Environment, EnvironmentLease, EnvironmentLeaseStatus, ExecutionWorkspace } from "@paperclipai/shared";
import { buildEnvironmentLeaseContext, type EnvironmentRuntimeLeaseRecord, type EnvironmentRuntimeService } from "./environment-runtime.js";
import { type AdapterExecutionTarget, type AdapterRemoteExecutionSpec } from "@paperclipai/adapter-utils/execution-target";
import type { RealizedExecutionWorkspace } from "./workspace-runtime.js";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
export type EnvironmentErrorCode = "environment_not_found" | "environment_inactive" | "unsupported_environment" | "unsupported_adapter_environment" | "probe_failed" | "lease_acquire_failed" | "workspace_realization_failed" | "transport_resolution_failed" | "lease_release_failed" | "lease_cleanup_failed";
export declare class EnvironmentRunError extends Error {
    code: EnvironmentErrorCode;
    environmentId?: string;
    driver?: string;
    provider?: string;
    cause?: unknown;
    constructor(code: EnvironmentErrorCode, message: string, details?: {
        environmentId?: string;
        driver?: string;
        provider?: string;
        cause?: unknown;
    });
}
export interface EnvironmentAcquisitionResult {
    environment: Environment;
    lease: EnvironmentLease;
    leaseContext: ReturnType<typeof buildEnvironmentLeaseContext>;
    executionTransport: Record<string, unknown> | null;
}
export interface EnvironmentRealizationResult {
    lease: EnvironmentLease;
    workspaceRealization: Record<string, unknown>;
    executionTarget: AdapterExecutionTarget | null;
    remoteExecution: AdapterRemoteExecutionSpec | null;
    persistedExecutionWorkspace: ExecutionWorkspace | null;
}
export interface EnvironmentReleaseResult {
    released: EnvironmentRuntimeLeaseRecord[];
    errors: Array<{
        leaseId: string;
        error: unknown;
    }>;
}
export declare function environmentRunOrchestrator(db: Db, options?: {
    pluginWorkerManager?: PluginWorkerManager;
    environmentRuntime?: EnvironmentRuntimeService;
}): {
    resolveEnvironment: (input: {
        companyId: string;
        selectedEnvironmentId: string;
        defaultEnvironmentId: string;
    }) => Promise<Environment>;
    acquireLease: (input: {
        companyId: string;
        environment: Environment;
        issueId: string | null;
        heartbeatRunId: string;
        persistedExecutionWorkspace: Pick<ExecutionWorkspace, "id" | "mode"> | null;
    }) => Promise<EnvironmentRuntimeLeaseRecord>;
    resolveTransport: (input: {
        companyId: string;
        adapterType: string;
        environment: Environment;
        leaseMetadata: Record<string, unknown> | null;
    }) => Promise<Record<string, unknown> | null>;
    acquireForRun: (input: {
        companyId: string;
        selectedEnvironmentId: string;
        defaultEnvironmentId: string;
        adapterType: string;
        issueId: string | null;
        heartbeatRunId: string;
        agentId: string;
        persistedExecutionWorkspace: Pick<ExecutionWorkspace, "id" | "mode"> | null;
    }) => Promise<EnvironmentAcquisitionResult>;
    realizeForRun: (input: {
        environment: Environment;
        lease: EnvironmentLease;
        adapterType: string;
        companyId: string;
        issueId: string | null;
        heartbeatRunId: string;
        executionWorkspace: RealizedExecutionWorkspace;
        effectiveExecutionWorkspaceMode: string | null;
        persistedExecutionWorkspace: ExecutionWorkspace | null;
    }) => Promise<EnvironmentRealizationResult>;
    releaseForRun: (input: {
        heartbeatRunId: string;
        companyId: string;
        agentId: string;
        status?: Extract<EnvironmentLeaseStatus, "released" | "expired" | "failed">;
        failureReason?: string;
    }) => Promise<EnvironmentReleaseResult>;
    runtime: {
        getDriver: (driverKey: string) => import("./environment-runtime.js").EnvironmentRuntimeDriver | null;
        acquireRunLease(input: {
            companyId: string;
            environment: Environment;
            issueId: string | null;
            heartbeatRunId: string | null;
            persistedExecutionWorkspace: Pick<ExecutionWorkspace, "id" | "mode"> | null;
        }): Promise<EnvironmentRuntimeLeaseRecord>;
        releaseRunLeases(heartbeatRunId: string, status?: Extract<EnvironmentLeaseStatus, "released" | "expired" | "failed">): Promise<EnvironmentRuntimeLeaseRecord[]>;
        resumeRunLease(input: import("./environment-runtime.js").EnvironmentDriverLeaseInput): Promise<import("@paperclipai/plugin-sdk").PluginEnvironmentLease | EnvironmentLease | null>;
        destroyRunLease(input: import("./environment-runtime.js").EnvironmentDriverLeaseInput): Promise<EnvironmentLease | null>;
        realizeWorkspace(input: import("./environment-runtime.js").EnvironmentDriverRealizeWorkspaceInput): Promise<import("@paperclipai/plugin-sdk").PluginEnvironmentRealizeWorkspaceResult>;
        execute(input: import("./environment-runtime.js").EnvironmentDriverExecuteInput): Promise<import("@paperclipai/plugin-sdk").PluginEnvironmentExecuteResult>;
    };
};
export type EnvironmentRunOrchestrator = ReturnType<typeof environmentRunOrchestrator>;
//# sourceMappingURL=environment-run-orchestrator.d.ts.map