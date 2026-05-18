import type { Request } from "express";
export declare function assertNoAgentHostWorkspaceCommandMutation(req: Request, paths: string[]): void;
export declare function collectAgentAdapterWorkspaceCommandPaths(adapterConfig: unknown, prefix?: string): string[];
export declare function collectProjectExecutionWorkspaceCommandPaths(policy: unknown): string[];
export declare function collectProjectWorkspaceCommandPaths(workspacePatch: unknown, prefix?: string): string[];
export declare function collectIssueWorkspaceCommandPaths(input: {
    executionWorkspaceSettings?: unknown;
    assigneeAdapterOverrides?: unknown;
}): string[];
export declare function collectExecutionWorkspaceCommandPaths(input: {
    config?: unknown;
    metadata?: unknown;
}): string[];
//# sourceMappingURL=workspace-command-authz.d.ts.map