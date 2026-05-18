import type { Db } from "@paperclipai/db";
import type { EnvironmentLease } from "@paperclipai/shared";
import { type AdapterExecutionTarget } from "@paperclipai/adapter-utils/execution-target";
import type { EnvironmentRuntimeService } from "./environment-runtime.js";
export declare const DEFAULT_SANDBOX_REMOTE_CWD = "/tmp";
export declare function resolveEnvironmentExecutionTarget(input: {
    db: Db;
    companyId: string;
    adapterType: string;
    environment: {
        id?: string;
        driver: string;
        config: Record<string, unknown> | null;
    };
    leaseId?: string | null;
    leaseMetadata: Record<string, unknown> | null;
    lease?: EnvironmentLease | null;
    environmentRuntime?: EnvironmentRuntimeService | null;
}): Promise<AdapterExecutionTarget | null>;
export declare function resolveEnvironmentExecutionTransport(input: Parameters<typeof resolveEnvironmentExecutionTarget>[0]): Promise<Record<string, unknown> | null>;
//# sourceMappingURL=environment-execution-target.d.ts.map