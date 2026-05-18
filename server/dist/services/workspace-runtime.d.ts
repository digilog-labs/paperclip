import type { AdapterRuntimeServiceReport } from "@paperclipai/adapter-utils";
import type { Db } from "@paperclipai/db";
import { type WorkspaceRuntimeDesiredState, type WorkspaceRuntimeServiceStateMap } from "@paperclipai/shared";
import type { WorkspaceOperationRecorder } from "./workspace-operations.js";
export declare function resolveShell(): string;
export interface ExecutionWorkspaceInput {
    baseCwd: string;
    source: "project_primary" | "task_session" | "agent_home";
    projectId: string | null;
    workspaceId: string | null;
    repoUrl: string | null;
    repoRef: string | null;
}
export interface ExecutionWorkspaceIssueRef {
    id: string;
    identifier: string | null;
    title: string | null;
    workMode?: string | null;
}
export interface ExecutionWorkspaceAgentRef {
    id: string | null;
    name: string;
    companyId: string;
}
export interface RealizedExecutionWorkspace extends ExecutionWorkspaceInput {
    strategy: "project_primary" | "git_worktree";
    cwd: string;
    branchName: string | null;
    worktreePath: string | null;
    warnings: string[];
    created: boolean;
}
export interface RuntimeServiceRef {
    id: string;
    companyId: string;
    projectId: string | null;
    projectWorkspaceId: string | null;
    executionWorkspaceId: string | null;
    issueId: string | null;
    serviceName: string;
    status: "starting" | "running" | "stopped" | "failed";
    lifecycle: "shared" | "ephemeral";
    scopeType: "project_workspace" | "execution_workspace" | "run" | "agent";
    scopeId: string | null;
    reuseKey: string | null;
    command: string | null;
    cwd: string | null;
    port: number | null;
    url: string | null;
    provider: "local_process" | "adapter_managed";
    providerRef: string | null;
    ownerAgentId: string | null;
    startedByRunId: string | null;
    lastUsedAt: string;
    startedAt: string;
    stoppedAt: string | null;
    stopPolicy: Record<string, unknown> | null;
    healthStatus: "unknown" | "healthy" | "unhealthy";
    reused: boolean;
}
export declare function resetRuntimeServicesForTests(): Promise<void>;
export declare function ensureServerWorkspaceLinksCurrent(startCwd: string, opts?: {
    onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}): Promise<void>;
export declare function sanitizeRuntimeServiceBaseEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function realizeExecutionWorkspace(input: {
    base: ExecutionWorkspaceInput;
    config: Record<string, unknown>;
    issue: ExecutionWorkspaceIssueRef | null;
    agent: ExecutionWorkspaceAgentRef;
    recorder?: WorkspaceOperationRecorder | null;
}): Promise<RealizedExecutionWorkspace>;
export declare function ensurePersistedExecutionWorkspaceAvailable(input: {
    base: ExecutionWorkspaceInput;
    workspace: {
        mode: string | null | undefined;
        strategyType: string | null | undefined;
        cwd: string | null | undefined;
        providerRef: string | null | undefined;
        projectId: string | null | undefined;
        projectWorkspaceId: string | null | undefined;
        repoUrl: string | null | undefined;
        baseRef: string | null | undefined;
        branchName: string | null | undefined;
        config?: {
            provisionCommand?: string | null;
        } | null;
    };
    issue: ExecutionWorkspaceIssueRef | null;
    agent: ExecutionWorkspaceAgentRef;
    recorder?: WorkspaceOperationRecorder | null;
}): Promise<RealizedExecutionWorkspace | null>;
export declare function cleanupExecutionWorkspaceArtifacts(input: {
    workspace: {
        id: string;
        cwd: string | null;
        providerType: string;
        providerRef: string | null;
        branchName: string | null;
        repoUrl: string | null;
        baseRef: string | null;
        projectId: string | null;
        projectWorkspaceId: string | null;
        sourceIssueId: string | null;
        metadata?: Record<string, unknown> | null;
    };
    projectWorkspace?: {
        cwd: string | null;
        cleanupCommand: string | null;
    } | null;
    cleanupCommand?: string | null;
    teardownCommand?: string | null;
    recorder?: WorkspaceOperationRecorder | null;
}): Promise<{
    cleanedPath: string | null;
    cleaned: boolean;
    warnings: string[];
}>;
export declare function runWorkspaceJobForControl(input: {
    actor: ExecutionWorkspaceAgentRef;
    issue: ExecutionWorkspaceIssueRef | null;
    workspace: RealizedExecutionWorkspace;
    command: Record<string, unknown>;
    adapterEnv?: Record<string, string>;
    recorder?: WorkspaceOperationRecorder | null;
    metadata?: Record<string, unknown> | null;
}): Promise<import("@paperclipai/shared").WorkspaceOperation | null>;
export declare function resolveWorkspaceRuntimeReadinessTimeoutSec(service: Record<string, unknown>): number;
export declare function normalizeAdapterManagedRuntimeServices(input: {
    adapterType: string;
    runId: string;
    agent: ExecutionWorkspaceAgentRef;
    issue: ExecutionWorkspaceIssueRef | null;
    workspace: RealizedExecutionWorkspace;
    executionWorkspaceId?: string | null;
    reports: AdapterRuntimeServiceReport[];
    now?: Date;
}): RuntimeServiceRef[];
export declare function listConfiguredRuntimeServiceEntries(config: Record<string, unknown>): Record<string, unknown>[];
export declare function buildWorkspaceRuntimeDesiredStatePatch(input: {
    config: Record<string, unknown>;
    currentDesiredState: WorkspaceRuntimeDesiredState | null;
    currentServiceStates: WorkspaceRuntimeServiceStateMap | null | undefined;
    action: "start" | "stop" | "restart";
    serviceIndex?: number | null;
}): {
    desiredState: WorkspaceRuntimeDesiredState;
    serviceStates: WorkspaceRuntimeServiceStateMap | null;
};
export declare function ensureRuntimeServicesForRun(input: {
    db?: Db;
    runId: string;
    agent: ExecutionWorkspaceAgentRef;
    issue: ExecutionWorkspaceIssueRef | null;
    workspace: RealizedExecutionWorkspace;
    executionWorkspaceId?: string | null;
    config: Record<string, unknown>;
    adapterEnv: Record<string, string>;
    onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}): Promise<RuntimeServiceRef[]>;
export declare function startRuntimeServicesForWorkspaceControl(input: {
    db?: Db;
    invocationId?: string;
    actor: ExecutionWorkspaceAgentRef;
    issue: ExecutionWorkspaceIssueRef | null;
    workspace: RealizedExecutionWorkspace;
    executionWorkspaceId?: string | null;
    config: Record<string, unknown>;
    adapterEnv: Record<string, string>;
    onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
    serviceIndex?: number | null;
    respectDesiredStates?: boolean;
}): Promise<RuntimeServiceRef[]>;
export declare function releaseRuntimeServicesForRun(runId: string): Promise<void>;
export declare function stopRuntimeServicesForExecutionWorkspace(input: {
    db?: Db;
    executionWorkspaceId: string;
    workspaceCwd?: string | null;
    runtimeServiceId?: string | null;
}): Promise<void>;
export declare function stopRuntimeServicesForProjectWorkspace(input: {
    db?: Db;
    projectWorkspaceId: string;
    runtimeServiceId?: string | null;
}): Promise<void>;
export declare function listWorkspaceRuntimeServicesForProjectWorkspaces(db: Db, companyId: string, projectWorkspaceIds: string[]): Promise<Map<string, {
    id: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    companyId: string;
    provider: string;
    lastUsedAt: Date;
    command: string | null;
    scopeType: string;
    scopeId: string | null;
    startedAt: Date;
    url: string | null;
    issueId: string | null;
    projectId: string | null;
    projectWorkspaceId: string | null;
    executionWorkspaceId: string | null;
    serviceName: string;
    lifecycle: string;
    reuseKey: string | null;
    cwd: string | null;
    port: number | null;
    providerRef: string | null;
    ownerAgentId: string | null;
    startedByRunId: string | null;
    stoppedAt: Date | null;
    stopPolicy: Record<string, unknown> | null;
    healthStatus: string;
}[]>>;
export declare function reconcilePersistedRuntimeServicesOnStartup(db: Db): Promise<{
    reconciled: number;
    adopted: number;
    stopped: number;
}>;
export declare function restartDesiredRuntimeServicesOnStartup(db: Db): Promise<{
    restarted: number;
    failed: number;
}>;
export declare function persistAdapterManagedRuntimeServices(input: {
    db: Db;
    adapterType: string;
    runId: string;
    agent: ExecutionWorkspaceAgentRef;
    issue: ExecutionWorkspaceIssueRef | null;
    workspace: RealizedExecutionWorkspace;
    executionWorkspaceId?: string | null;
    reports: AdapterRuntimeServiceReport[];
}): Promise<RuntimeServiceRef[]>;
export declare function buildWorkspaceReadyComment(input: {
    workspace: RealizedExecutionWorkspace;
    runtimeServices: RuntimeServiceRef[];
}): string;
//# sourceMappingURL=workspace-runtime.d.ts.map