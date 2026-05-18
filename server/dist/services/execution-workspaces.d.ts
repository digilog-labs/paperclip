import type { Db } from "@paperclipai/db";
import { executionWorkspaces } from "@paperclipai/db";
import type { ExecutionWorkspace, ExecutionWorkspaceSummary, ExecutionWorkspaceCloseReadiness, ExecutionWorkspaceConfig, WorkspaceRuntimeService } from "@paperclipai/shared";
type ExecutionWorkspaceRow = typeof executionWorkspaces.$inferSelect;
export declare function readExecutionWorkspaceConfig(metadata: Record<string, unknown> | null | undefined): ExecutionWorkspaceConfig | null;
export declare function mergeExecutionWorkspaceConfig(metadata: Record<string, unknown> | null | undefined, patch: Partial<ExecutionWorkspaceConfig> | null): Record<string, unknown> | null;
declare function toExecutionWorkspace(row: ExecutionWorkspaceRow, runtimeServices?: WorkspaceRuntimeService[]): ExecutionWorkspace;
export declare function executionWorkspaceService(db: Db): {
    list: (companyId: string, filters?: {
        projectId?: string;
        projectWorkspaceId?: string;
        issueId?: string;
        status?: string;
        reuseEligible?: boolean;
    }) => Promise<ExecutionWorkspace[]>;
    listSummaries: (companyId: string, filters?: {
        projectId?: string;
        projectWorkspaceId?: string;
        issueId?: string;
        status?: string;
        reuseEligible?: boolean;
    }) => Promise<ExecutionWorkspaceSummary[]>;
    getById: (id: string) => Promise<ExecutionWorkspace | null>;
    getCloseReadiness: (id: string) => Promise<ExecutionWorkspaceCloseReadiness | null>;
    create: (data: typeof executionWorkspaces.$inferInsert) => Promise<ExecutionWorkspace | null>;
    update: (id: string, patch: Partial<typeof executionWorkspaces.$inferInsert>) => Promise<ExecutionWorkspace | null>;
    clearEnvironmentSelection: (companyId: string, environmentId: string) => Promise<number>;
};
export { toExecutionWorkspace };
//# sourceMappingURL=execution-workspaces.d.ts.map