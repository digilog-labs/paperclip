import type { EnvironmentLeaseStatus, EnvironmentProbeResult, SandboxEnvironmentConfig, SandboxEnvironmentProvider } from "@paperclipai/shared";
export interface SandboxProviderValidationResult {
    ok: boolean;
    summary: string;
    details?: Record<string, unknown>;
}
export interface AcquireSandboxLeaseInput {
    config: SandboxEnvironmentConfig;
    environmentId: string;
    heartbeatRunId: string;
    issueId: string | null;
}
export interface ResumeSandboxLeaseInput {
    config: SandboxEnvironmentConfig;
    providerLeaseId: string;
}
export interface ReleaseSandboxLeaseInput {
    config: SandboxEnvironmentConfig;
    providerLeaseId: string | null;
    status: Extract<EnvironmentLeaseStatus, "released" | "expired" | "failed">;
}
export interface DestroySandboxLeaseInput {
    config: SandboxEnvironmentConfig;
    providerLeaseId: string | null;
}
export interface PrepareSandboxWorkspaceInput {
    config: SandboxEnvironmentConfig;
    providerLeaseId: string | null;
    workspace: {
        localPath?: string;
        remotePath?: string;
        mode?: string;
        metadata?: Record<string, unknown>;
    };
}
export interface SandboxExecuteInput {
    config: SandboxEnvironmentConfig;
    providerLeaseId: string | null;
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    stdin?: string;
    timeoutMs?: number;
}
export interface SandboxLeaseHandle {
    providerLeaseId: string;
    metadata: Record<string, unknown>;
}
export interface PreparedSandboxWorkspace {
    remotePath?: string | null;
    metadata?: Record<string, unknown>;
}
export interface SandboxExecuteResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}
export interface SandboxProvider {
    readonly provider: SandboxEnvironmentProvider;
    validateConfig(config: SandboxEnvironmentConfig): Promise<SandboxProviderValidationResult>;
    probe(config: SandboxEnvironmentConfig): Promise<EnvironmentProbeResult>;
    acquireLease(input: AcquireSandboxLeaseInput): Promise<SandboxLeaseHandle>;
    resumeLease(input: ResumeSandboxLeaseInput): Promise<SandboxLeaseHandle | null>;
    releaseLease(input: ReleaseSandboxLeaseInput): Promise<void>;
    destroyLease(input: DestroySandboxLeaseInput): Promise<void>;
    matchesReusableLease(input: {
        config: SandboxEnvironmentConfig;
        lease: {
            providerLeaseId: string | null;
            metadata: Record<string, unknown> | null;
        };
    }): boolean;
    configFromLeaseMetadata(metadata: Record<string, unknown>): SandboxEnvironmentConfig | null;
    prepareWorkspace?(input: PrepareSandboxWorkspaceInput): Promise<PreparedSandboxWorkspace>;
    execute?(input: SandboxExecuteInput): Promise<SandboxExecuteResult>;
}
/**
 * Returns a built-in sandbox provider, or null if the provider key is not
 * registered. Plugin-backed providers are not returned here — they are
 * resolved through the plugin worker manager at the environment-runtime level.
 */
export declare function getSandboxProvider(provider: string): SandboxProvider | null;
export declare function requireSandboxProvider(provider: string): SandboxProvider;
/**
 * Returns true if the given provider key is handled by a built-in sandbox
 * provider (as opposed to a plugin-backed provider).
 */
export declare function isBuiltinSandboxProvider(provider: string): boolean;
export declare function listSandboxProviders(): SandboxProvider[];
export declare function validateSandboxProviderConfig(config: SandboxEnvironmentConfig): Promise<SandboxProviderValidationResult>;
export declare function sandboxConfigFromLeaseMetadata(lease: Pick<{
    metadata: Record<string, unknown> | null;
}, "metadata">): SandboxEnvironmentConfig | null;
/**
 * Reconstruct a sandbox environment config from lease metadata, including
 * plugin-backed providers. For plugin-backed providers, the
 * config is synthesized from lease metadata fields without requiring the
 * built-in provider to be registered.
 */
export declare function sandboxConfigFromLeaseMetadataLoose(lease: Pick<{
    metadata: Record<string, unknown> | null;
}, "metadata">): SandboxEnvironmentConfig | null;
export declare function findReusableSandboxProviderLeaseId(input: {
    config: SandboxEnvironmentConfig;
    leases: Array<{
        providerLeaseId: string | null;
        metadata: Record<string, unknown> | null;
    }>;
}): string | null;
export declare function probeSandboxProvider(config: SandboxEnvironmentConfig): Promise<EnvironmentProbeResult>;
export declare function acquireSandboxProviderLease(input: {
    config: SandboxEnvironmentConfig;
    environmentId: string;
    heartbeatRunId: string;
    issueId: string | null;
    reusableProviderLeaseId?: string | null;
}): Promise<SandboxLeaseHandle>;
export declare function resumeSandboxProviderLease(input: {
    config: SandboxEnvironmentConfig;
    providerLeaseId: string;
}): Promise<SandboxLeaseHandle | null>;
export declare function releaseSandboxProviderLease(input: {
    config: SandboxEnvironmentConfig;
    providerLeaseId: string | null;
    status: Extract<EnvironmentLeaseStatus, "released" | "expired" | "failed">;
}): Promise<void>;
export declare function destroySandboxProviderLease(input: {
    config: SandboxEnvironmentConfig;
    providerLeaseId: string | null;
}): Promise<void>;
//# sourceMappingURL=sandbox-provider-runtime.d.ts.map