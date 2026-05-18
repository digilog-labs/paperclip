export type PersistedDevServerStatus = {
    dirty: boolean;
    lastChangedAt: string | null;
    changedPathCount: number;
    changedPathsSample: string[];
    pendingMigrations: string[];
    lastRestartAt: string | null;
};
export type DevServerHealthStatus = {
    enabled: true;
    restartRequired: boolean;
    reason: "backend_changes" | "pending_migrations" | "backend_changes_and_pending_migrations" | null;
    lastChangedAt: string | null;
    changedPathCount: number;
    changedPathsSample: string[];
    pendingMigrations: string[];
    autoRestartEnabled: boolean;
    activeRunCount: number;
    waitingForIdle: boolean;
    lastRestartAt: string | null;
};
export declare function readPersistedDevServerStatus(env?: NodeJS.ProcessEnv): PersistedDevServerStatus | null;
export declare function toDevServerHealthStatus(persisted: PersistedDevServerStatus, opts: {
    autoRestartEnabled: boolean;
    activeRunCount: number;
}): DevServerHealthStatus;
//# sourceMappingURL=dev-server-status.d.ts.map