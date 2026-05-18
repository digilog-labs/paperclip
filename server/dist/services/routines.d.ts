import type { Db } from "@paperclipai/db";
import type { CreateRoutine, CreateRoutineTrigger, Routine, RoutineDetail, RoutineListItem, RoutineRevision, RoutineRunSummary, RoutineTrigger, RoutineTriggerSecretMaterial, RoutineVariable, RunRoutine, UpdateRoutine, UpdateRoutineTrigger } from "@paperclipai/shared";
import { type IssueAssignmentWakeupDeps } from "./issue-assignment-wakeup.js";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
type Actor = {
    agentId?: string | null;
    userId?: string | null;
    runId?: string | null;
};
interface RoutineTriggerSecretRestoreMaterial extends RoutineTriggerSecretMaterial {
    triggerId: string;
}
export declare function routineService(db: Db, deps?: {
    heartbeat?: IssueAssignmentWakeupDeps;
    pluginWorkerManager?: PluginWorkerManager;
}): {
    get: (id: string) => Promise<{
        id: string;
        companyId: string;
        projectId: string | null;
        goalId: string | null;
        parentIssueId: string | null;
        title: string;
        description: string | null;
        assigneeAgentId: string | null;
        priority: string;
        status: string;
        concurrencyPolicy: string;
        catchUpPolicy: string;
        variables: RoutineVariable[];
        env: import("@paperclipai/shared").RoutineEnvConfig | null;
        latestRevisionId: string | null;
        latestRevisionNumber: number;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        updatedByAgentId: string | null;
        updatedByUserId: string | null;
        lastTriggeredAt: Date | null;
        lastEnqueuedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getTrigger: (id: string) => Promise<{
        id: string;
        companyId: string;
        routineId: string;
        kind: string;
        label: string | null;
        enabled: boolean;
        cronExpression: string | null;
        timezone: string | null;
        nextRunAt: Date | null;
        lastFiredAt: Date | null;
        publicId: string | null;
        secretId: string | null;
        signingMode: string | null;
        replayWindowSec: number | null;
        lastRotatedAt: Date | null;
        lastResult: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        updatedByAgentId: string | null;
        updatedByUserId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    list: (companyId: string, filters?: {
        projectId?: string | null;
    }) => Promise<RoutineListItem[]>;
    getDetail: (id: string) => Promise<RoutineDetail | null>;
    create: (companyId: string, input: CreateRoutine, actor: Actor) => Promise<Routine>;
    update: (id: string, patch: UpdateRoutine, actor: Actor) => Promise<Routine | null>;
    createTrigger: (routineId: string, input: CreateRoutineTrigger, actor: Actor) => Promise<{
        trigger: RoutineTrigger;
        secretMaterial: RoutineTriggerSecretMaterial | null;
        revision: RoutineRevision;
    }>;
    updateTrigger: (id: string, patch: UpdateRoutineTrigger, actor: Actor) => Promise<{
        trigger: RoutineTrigger;
        revision: RoutineRevision;
    } | null>;
    deleteTrigger: (id: string, actor?: Actor) => Promise<{
        deleted: boolean;
        revision: RoutineRevision | null;
    }>;
    rotateTriggerSecret: (id: string, actor: Actor) => Promise<{
        trigger: RoutineTrigger;
        secretMaterial: RoutineTriggerSecretMaterial;
        revision: RoutineRevision;
    }>;
    listRevisions: (routineId: string) => Promise<RoutineRevision[]>;
    restoreRevision: (routineId: string, revisionId: string, actor: Actor) => Promise<{
        routine: Routine;
        revision: RoutineRevision;
        restoredFromRevisionId: string;
        restoredFromRevisionNumber: number;
        secretMaterials: RoutineTriggerSecretRestoreMaterial[];
    }>;
    runRoutine: (id: string, input: RunRoutine, actor?: Actor) => Promise<{
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
    firePublicTrigger: (publicId: string, input: {
        authorizationHeader?: string | null;
        signatureHeader?: string | null;
        hubSignatureHeader?: string | null;
        timestampHeader?: string | null;
        idempotencyKey?: string | null;
        rawBody?: Buffer | null;
        payload?: Record<string, unknown> | null;
    }) => Promise<{
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
    listRuns: (routineId: string, limit?: number) => Promise<RoutineRunSummary[]>;
    tickScheduledTriggers: (now?: Date) => Promise<{
        triggered: number;
    }>;
    syncRunStatusForIssue: (issueId: string) => Promise<{
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
    } | null>;
};
export {};
//# sourceMappingURL=routines.d.ts.map