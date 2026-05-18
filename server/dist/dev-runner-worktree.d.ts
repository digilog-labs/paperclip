type WorktreeEnvBootstrapResult = {
    envPath: null;
    missingEnv: false;
} | {
    envPath: string;
    missingEnv: true;
} | {
    envPath: string;
    missingEnv: false;
};
export declare function isLinkedGitWorktreeCheckout(rootDir: string): boolean;
export declare function resolveWorktreeEnvFilePath(rootDir: string): string;
export declare function bootstrapDevRunnerWorktreeEnv(rootDir: string, env?: NodeJS.ProcessEnv): WorktreeEnvBootstrapResult;
export {};
//# sourceMappingURL=dev-runner-worktree.d.ts.map