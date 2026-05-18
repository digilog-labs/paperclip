import type { BackupRetentionPolicy, RunDatabaseBackupResult } from "@paperclipai/db";
export type InstanceDatabaseBackupTrigger = "manual" | "scheduled";
export type InstanceDatabaseBackupRunResult = RunDatabaseBackupResult & {
    trigger: InstanceDatabaseBackupTrigger;
    backupDir: string;
    retention: BackupRetentionPolicy;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
};
export type InstanceDatabaseBackupService = {
    runManualBackup(): Promise<InstanceDatabaseBackupRunResult>;
};
export declare function instanceDatabaseBackupRoutes(service: InstanceDatabaseBackupService): import("express-serve-static-core").Router;
//# sourceMappingURL=instance-database-backups.d.ts.map