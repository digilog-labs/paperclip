import { expandHomePrefix, resolveHomeAwarePath, resolvePaperclipHomeDir, resolvePaperclipInstanceId, resolvePaperclipInstanceRoot } from "@paperclipai/shared/home-paths";
export { expandHomePrefix, resolveHomeAwarePath, resolvePaperclipHomeDir, resolvePaperclipInstanceId, resolvePaperclipInstanceRoot, };
export declare function resolveDefaultConfigPath(): string;
export declare function resolveDefaultEmbeddedPostgresDir(): string;
export declare function resolveDefaultLogsDir(): string;
export declare function resolveDefaultSecretsKeyFilePath(): string;
export declare function resolveDefaultStorageDir(): string;
export declare function resolveDefaultBackupDir(): string;
export declare function resolveDefaultAgentWorkspaceDir(agentId: string): string;
export declare function resolveManagedProjectWorkspaceDir(input: {
    companyId: string;
    projectId: string;
    repoName?: string | null;
}): string;
//# sourceMappingURL=home-paths.d.ts.map