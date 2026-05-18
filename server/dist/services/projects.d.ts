import type { Db } from "@paperclipai/db";
import { projects } from "@paperclipai/db";
import { type ProjectCodebase, type ProjectExecutionWorkspacePolicy, type ProjectGoalRef, type ProjectManagedByPlugin, type ProjectWorkspaceRuntimeConfig, type ProjectWorkspace, type PluginManagedProjectResolution } from "@paperclipai/shared";
type ProjectRow = typeof projects.$inferSelect;
type CreateWorkspaceInput = {
    name?: string | null;
    sourceType?: string | null;
    cwd?: string | null;
    repoUrl?: string | null;
    repoRef?: string | null;
    defaultRef?: string | null;
    visibility?: string | null;
    setupCommand?: string | null;
    cleanupCommand?: string | null;
    remoteProvider?: string | null;
    remoteWorkspaceRef?: string | null;
    sharedWorkspaceKey?: string | null;
    metadata?: Record<string, unknown> | null;
    runtimeConfig?: Partial<ProjectWorkspaceRuntimeConfig> | null;
    isPrimary?: boolean;
};
type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;
interface ProjectWithGoals extends Omit<ProjectRow, "executionWorkspacePolicy"> {
    urlKey: string;
    goalIds: string[];
    goals: ProjectGoalRef[];
    executionWorkspacePolicy: ProjectExecutionWorkspacePolicy | null;
    codebase: ProjectCodebase;
    workspaces: ProjectWorkspace[];
    primaryWorkspace: ProjectWorkspace | null;
    managedByPlugin: ProjectManagedByPlugin | null;
}
interface ProjectShortnameRow {
    id: string;
    name: string;
}
interface ResolveProjectNameOptions {
    excludeProjectId?: string | null;
}
export declare function resolveProjectNameForUniqueShortname(requestedName: string, existingProjects: ProjectShortnameRow[], options?: ResolveProjectNameOptions): string;
export declare function projectService(db: Db): {
    list: (companyId: string) => Promise<ProjectWithGoals[]>;
    listByIds: (companyId: string, ids: string[]) => Promise<ProjectWithGoals[]>;
    getById: (id: string) => Promise<ProjectWithGoals | null>;
    resolveManagedProject: (input: {
        companyId: string;
        pluginId: string;
        pluginKey: string;
        projectKey: string;
        reset?: boolean;
        createIfMissing?: boolean;
    }) => Promise<PluginManagedProjectResolution>;
    create: (companyId: string, data: Omit<typeof projects.$inferInsert, "companyId"> & {
        goalIds?: string[];
    }) => Promise<ProjectWithGoals>;
    update: (id: string, data: Partial<typeof projects.$inferInsert> & {
        goalIds?: string[];
    }) => Promise<ProjectWithGoals | null>;
    clearExecutionWorkspaceEnvironmentSelection: (companyId: string, environmentId: string) => Promise<number>;
    remove: (id: string) => Promise<{
        urlKey: string;
        id: string;
        name: string;
        description: string | null;
        status: string;
        pauseReason: string | null;
        pausedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        goalId: string | null;
        color: string | null;
        env: import("@paperclipai/shared").AgentEnvConfig | null;
        targetDate: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
        leadAgentId: string | null;
        archivedAt: Date | null;
    } | null>;
    listWorkspaces: (projectId: string) => Promise<ProjectWorkspace[]>;
    createWorkspace: (projectId: string, data: CreateWorkspaceInput) => Promise<ProjectWorkspace | null>;
    updateWorkspace: (projectId: string, workspaceId: string, data: UpdateWorkspaceInput) => Promise<ProjectWorkspace | null>;
    removeWorkspace: (projectId: string, workspaceId: string) => Promise<ProjectWorkspace | null>;
    resolveByReference: (companyId: string, reference: string) => Promise<{
        readonly project: null;
        readonly ambiguous: false;
    } | {
        readonly project: {
            readonly id: string;
            readonly companyId: string;
            readonly urlKey: string;
        };
        readonly ambiguous: false;
    } | {
        readonly project: null;
        readonly ambiguous: true;
    }>;
};
export {};
//# sourceMappingURL=projects.d.ts.map