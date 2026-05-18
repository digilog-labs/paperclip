import type { Environment, EnvironmentLease, ExecutionWorkspaceConfig, WorkspaceRealizationRecord, WorkspaceRealizationRequest } from "@paperclipai/shared";
import type { RealizedExecutionWorkspace } from "./workspace-runtime.js";
export declare function buildWorkspaceRealizationRequest(input: {
    adapterType: string;
    companyId: string;
    environmentId: string;
    executionWorkspaceId: string | null;
    issueId: string | null;
    heartbeatRunId: string;
    requestedMode: string | null;
    workspace: RealizedExecutionWorkspace;
    workspaceConfig: ExecutionWorkspaceConfig | null;
}): WorkspaceRealizationRequest;
export declare function buildWorkspaceRealizationRecord(input: {
    environment: Environment;
    lease: EnvironmentLease;
    request: WorkspaceRealizationRequest;
    realizedCwd?: string | null;
    providerMetadata?: Record<string, unknown> | null;
}): WorkspaceRealizationRecord;
export declare function buildWorkspaceRealizationRecordFromDriverInput(input: {
    environment: Environment;
    lease: EnvironmentLease;
    workspace: {
        localPath?: string;
        remotePath?: string;
        mode?: string;
        metadata?: Record<string, unknown>;
    };
    cwd?: string | null;
    providerMetadata?: Record<string, unknown> | null;
}): WorkspaceRealizationRecord;
//# sourceMappingURL=workspace-realization.d.ts.map