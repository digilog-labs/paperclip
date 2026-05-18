import express, { type Request as ExpressRequest } from "express";
import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import type { StorageService } from "./storage/types.js";
import { type InstanceDatabaseBackupService } from "./routes/instance-database-backups.js";
import { type PluginWorkerManager } from "./services/plugin-worker-manager.js";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";
type UiMode = "none" | "static" | "vite-dev";
export declare function resolveViteHmrPort(serverPort: number): number;
export declare function shouldServeViteDevHtml(req: ExpressRequest): boolean;
export declare function shouldEnablePrivateHostnameGuard(opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
}): boolean;
export declare function createApp(db: Db, opts: {
    uiMode: UiMode;
    serverPort: number;
    storageService: StorageService;
    feedbackExportService?: {
        flushPendingFeedbackTraces(input?: {
            companyId?: string;
            traceId?: string;
            limit?: number;
            now?: Date;
        }): Promise<unknown>;
    };
    databaseBackupService?: InstanceDatabaseBackupService;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    allowedHostnames: string[];
    bindHost: string;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    instanceId?: string;
    hostVersion?: string;
    localPluginDir?: string;
    pluginMigrationDb?: Db;
    pluginWorkerManager?: PluginWorkerManager;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
}): Promise<import("express-serve-static-core").Express>;
export {};
//# sourceMappingURL=app.d.ts.map