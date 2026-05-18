import type { Db } from "@paperclipai/db";
import { type CreateEnvironment, type Environment, type EnvironmentLease, type EnvironmentLeaseCleanupStatus, type EnvironmentLeasePolicy, type EnvironmentLeaseStatus, type UpdateEnvironment } from "@paperclipai/shared";
export declare function environmentService(db: Db): {
    list: (companyId: string, filters?: {
        status?: string;
        driver?: string;
    }) => Promise<Environment[]>;
    getById: (id: string) => Promise<Environment | null>;
    getLeaseById: (id: string) => Promise<EnvironmentLease | null>;
    ensureLocalEnvironment: (companyId: string) => Promise<Environment>;
    create: (companyId: string, input: CreateEnvironment) => Promise<Environment>;
    update: (id: string, patch: UpdateEnvironment) => Promise<Environment | null>;
    remove: (id: string) => Promise<Environment | null>;
    listLeases: (environmentId: string, filters?: {
        status?: string;
    }) => Promise<EnvironmentLease[]>;
    acquireLease: (input: {
        companyId: string;
        environmentId: string;
        executionWorkspaceId?: string | null;
        issueId?: string | null;
        heartbeatRunId?: string | null;
        leasePolicy?: EnvironmentLeasePolicy;
        provider?: string | null;
        providerLeaseId?: string | null;
        expiresAt?: Date | null;
        metadata?: Record<string, unknown> | null;
    }) => Promise<EnvironmentLease>;
    releaseLease: (id: string, status?: Extract<EnvironmentLeaseStatus, "released" | "expired" | "failed" | "retained">, options?: {
        failureReason?: string;
        cleanupStatus?: EnvironmentLeaseCleanupStatus;
    }) => Promise<EnvironmentLease | null>;
    updateLeaseMetadata: (id: string, metadata: Record<string, unknown> | null) => Promise<EnvironmentLease | null>;
    releaseLeasesForRun: (heartbeatRunId: string, status?: Extract<EnvironmentLeaseStatus, "released" | "expired" | "failed">) => Promise<EnvironmentLease[]>;
};
//# sourceMappingURL=environments.d.ts.map