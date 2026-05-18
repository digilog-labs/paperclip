import type { PaperclipConfig } from "@paperclipai/shared";
export declare function applyRuntimePortSelectionToConfig(config: PaperclipConfig, input: {
    serverPort: number;
    databasePort?: number | null;
    allowServerPortWrite?: boolean;
    allowDatabasePortWrite?: boolean;
}): {
    config: PaperclipConfig;
    changed: boolean;
};
export declare function maybeRepairLegacyWorktreeConfigAndEnvFiles(): {
    repairedConfig: boolean;
    repairedEnv: boolean;
};
export declare function maybePersistWorktreeRuntimePorts(input: {
    serverPort: number;
    databasePort?: number | null;
}): void;
//# sourceMappingURL=worktree-config.d.ts.map