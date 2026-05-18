export interface LocalServiceRegistryRecord {
    version: 1;
    serviceKey: string;
    profileKind: string;
    serviceName: string;
    command: string;
    cwd: string;
    envFingerprint: string;
    port: number | null;
    url: string | null;
    pid: number;
    processGroupId: number | null;
    provider: "local_process";
    runtimeServiceId: string | null;
    reuseKey: string | null;
    startedAt: string;
    lastSeenAt: string;
    metadata: Record<string, unknown> | null;
}
export interface LocalServiceIdentityInput {
    profileKind: string;
    serviceName: string;
    cwd: string;
    command: string;
    envFingerprint: string;
    port: number | null;
    scope: Record<string, unknown> | null;
}
export declare function createLocalServiceKey(input: LocalServiceIdentityInput): string;
export declare function writeLocalServiceRegistryRecord(record: LocalServiceRegistryRecord): Promise<void>;
export declare function removeLocalServiceRegistryRecord(serviceKey: string): Promise<void>;
export declare function readLocalServiceRegistryRecord(serviceKey: string): Promise<LocalServiceRegistryRecord | null>;
export declare function listLocalServiceRegistryRecords(filter?: {
    profileKind?: string;
    metadata?: Record<string, unknown>;
}): Promise<LocalServiceRegistryRecord[]>;
export declare function findLocalServiceRegistryRecordByRuntimeServiceId(input: {
    runtimeServiceId: string;
    profileKind?: string;
}): Promise<LocalServiceRegistryRecord | null>;
export declare function isPidAlive(pid: number): boolean;
export declare function isProcessGroupAlive(processGroupId: number | null | undefined): boolean;
export declare function findAdoptableLocalService(input: {
    serviceKey: string;
    command?: string | null;
    cwd?: string | null;
    envFingerprint?: string | null;
    port?: number | null;
}): Promise<LocalServiceRegistryRecord | null>;
export declare function touchLocalServiceRegistryRecord(serviceKey: string, patch?: Partial<Omit<LocalServiceRegistryRecord, "serviceKey" | "version">>): Promise<LocalServiceRegistryRecord | null>;
export declare function terminateLocalService(record: Pick<LocalServiceRegistryRecord, "pid" | "processGroupId">, opts?: {
    signal?: NodeJS.Signals;
    forceAfterMs?: number;
}): Promise<void>;
export declare function readLocalServicePortOwner(port: number): Promise<number | null>;
//# sourceMappingURL=local-service-supervisor.d.ts.map