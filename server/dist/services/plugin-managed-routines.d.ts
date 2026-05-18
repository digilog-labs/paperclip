import type { Db } from "@paperclipai/db";
import type { PluginManagedRoutineResolution, Routine } from "@paperclipai/shared";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
interface PluginManagedRoutineServiceOptions {
    pluginId: string;
    pluginKey: string;
    manifest?: import("@paperclipai/shared").PaperclipPluginManifestV1 | null;
    pluginWorkerManager?: PluginWorkerManager;
}
interface RoutineOverrides {
    assigneeAgentId?: string | null;
    projectId?: string | null;
}
export declare function pluginManagedRoutineService(db: Db, options: PluginManagedRoutineServiceOptions): {
    get: (routineKey: string, companyId: string) => Promise<PluginManagedRoutineResolution>;
    reconcile: (routineKey: string, companyId: string, overrides?: RoutineOverrides) => Promise<PluginManagedRoutineResolution>;
    reset: (routineKey: string, companyId: string, overrides?: RoutineOverrides) => Promise<PluginManagedRoutineResolution>;
    update: (routineKey: string, companyId: string, patch: {
        status?: string;
    }) => Promise<Routine>;
    run: (routineKey: string, companyId: string, overrides?: RoutineOverrides) => Promise<{
        id: string;
        companyId: string;
        routineId: string;
        triggerId: string | null;
        source: string;
        status: string;
        triggeredAt: Date;
        routineRevisionId: string | null;
        idempotencyKey: string | null;
        triggerPayload: Record<string, unknown> | null;
        dispatchFingerprint: string | null;
        linkedIssueId: string | null;
        coalescedIntoRunId: string | null;
        failureReason: string | null;
        completedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
};
export {};
//# sourceMappingURL=plugin-managed-routines.d.ts.map