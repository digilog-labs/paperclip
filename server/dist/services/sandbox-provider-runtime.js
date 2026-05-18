import { randomUUID } from "node:crypto";
function assertProviderConfig(provider, config) {
    if (config.provider !== provider) {
        throw new Error(`Sandbox provider "${provider}" received config for provider "${config.provider}".`);
    }
}
function buildFakeSandboxProbe(config) {
    return {
        ok: true,
        driver: "sandbox",
        summary: `Fake sandbox provider is ready for image ${config.image}.`,
        details: {
            provider: config.provider,
            image: config.image,
            reuseLease: config.reuseLease,
        },
    };
}
class FakeSandboxProvider {
    provider = "fake";
    async validateConfig(config) {
        assertProviderConfig(this.provider, config);
        return {
            ok: true,
            summary: `Fake sandbox provider config is valid for image ${config.image}.`,
            details: {
                provider: config.provider,
                image: config.image,
                reuseLease: config.reuseLease,
            },
        };
    }
    async probe(config) {
        assertProviderConfig(this.provider, config);
        return buildFakeSandboxProbe(config);
    }
    async acquireLease(input) {
        assertProviderConfig(this.provider, input.config);
        const providerLeaseId = input.config.reuseLease
            ? `sandbox://fake/${input.environmentId}`
            : `sandbox://fake/${input.heartbeatRunId}/${randomUUID()}`;
        return {
            providerLeaseId,
            metadata: {
                provider: input.config.provider,
                image: input.config.image,
                reuseLease: input.config.reuseLease,
            },
        };
    }
    async resumeLease(input) {
        assertProviderConfig(this.provider, input.config);
        return {
            providerLeaseId: input.providerLeaseId,
            metadata: {
                provider: input.config.provider,
                image: input.config.image,
                reuseLease: input.config.reuseLease,
                resumedLease: true,
            },
        };
    }
    async releaseLease() {
        return;
    }
    async destroyLease() {
        return;
    }
    matchesReusableLease(input) {
        assertProviderConfig(this.provider, input.config);
        return (typeof input.lease.providerLeaseId === "string" &&
            input.lease.providerLeaseId.length > 0 &&
            input.lease.metadata?.provider === input.config.provider &&
            input.lease.metadata?.reuseLease === true &&
            input.lease.metadata?.image === input.config.image);
    }
    configFromLeaseMetadata(metadata) {
        if (metadata.provider !== this.provider || typeof metadata.image !== "string") {
            return null;
        }
        return {
            provider: this.provider,
            image: metadata.image,
            reuseLease: metadata.reuseLease === true,
        };
    }
}
// ---------------------------------------------------------------------------
// Provider registry — built-in providers only.
// Plugin-backed providers are resolved through the plugin environment driver
// system at the environment-runtime layer.
// ---------------------------------------------------------------------------
const registeredSandboxProviders = new Map([
    ["fake", new FakeSandboxProvider()],
]);
/**
 * Returns a built-in sandbox provider, or null if the provider key is not
 * registered. Plugin-backed providers are not returned here — they are
 * resolved through the plugin worker manager at the environment-runtime level.
 */
export function getSandboxProvider(provider) {
    return registeredSandboxProviders.get(provider) ?? null;
}
export function requireSandboxProvider(provider) {
    const sandboxProvider = getSandboxProvider(provider);
    if (!sandboxProvider) {
        throw new Error(`Sandbox provider "${provider}" is not registered as a built-in provider.`);
    }
    return sandboxProvider;
}
/**
 * Returns true if the given provider key is handled by a built-in sandbox
 * provider (as opposed to a plugin-backed provider).
 */
export function isBuiltinSandboxProvider(provider) {
    return registeredSandboxProviders.has(provider);
}
export function listSandboxProviders() {
    return [...registeredSandboxProviders.values()];
}
export async function validateSandboxProviderConfig(config) {
    return await requireSandboxProvider(config.provider).validateConfig(config);
}
export function sandboxConfigFromLeaseMetadata(lease) {
    const metadata = lease.metadata ?? {};
    const provider = typeof metadata.provider === "string" ? getSandboxProvider(metadata.provider) : null;
    return provider?.configFromLeaseMetadata(metadata) ?? null;
}
/**
 * Reconstruct a sandbox environment config from lease metadata, including
 * plugin-backed providers. For plugin-backed providers, the
 * config is synthesized from lease metadata fields without requiring the
 * built-in provider to be registered.
 */
export function sandboxConfigFromLeaseMetadataLoose(lease) {
    const metadata = lease.metadata ?? {};
    const providerKey = typeof metadata.provider === "string" ? metadata.provider : null;
    if (!providerKey)
        return null;
    // Try built-in provider first.
    const builtinProvider = getSandboxProvider(providerKey);
    if (builtinProvider) {
        return builtinProvider.configFromLeaseMetadata(metadata);
    }
    return {
        ...metadata,
        provider: providerKey,
        reuseLease: metadata.reuseLease === true,
    };
}
export function findReusableSandboxProviderLeaseId(input) {
    const provider = getSandboxProvider(input.config.provider);
    if (!provider) {
        for (const lease of input.leases) {
            const metadata = lease.metadata ?? {};
            if (typeof lease.providerLeaseId === "string" &&
                lease.providerLeaseId.length > 0 &&
                metadata.provider === input.config.provider &&
                metadataMatchesPluginSandboxConfig(input.config, metadata)) {
                return lease.providerLeaseId;
            }
        }
        return null;
    }
    for (const lease of input.leases) {
        if (provider.matchesReusableLease({ config: input.config, lease })) {
            return lease.providerLeaseId;
        }
    }
    return null;
}
function metadataMatchesPluginSandboxConfig(config, metadata) {
    if (metadata.reuseLease !== true)
        return false;
    for (const [key, value] of Object.entries(config)) {
        if (key === "provider" || key === "reuseLease")
            continue;
        if (value === undefined)
            continue;
        if (JSON.stringify(metadata[key]) !== JSON.stringify(value)) {
            return false;
        }
    }
    return true;
}
export async function probeSandboxProvider(config) {
    return await requireSandboxProvider(config.provider).probe(config);
}
export async function acquireSandboxProviderLease(input) {
    const provider = requireSandboxProvider(input.config.provider);
    if (input.config.reuseLease && input.reusableProviderLeaseId) {
        const resumedLease = await provider.resumeLease({
            config: input.config,
            providerLeaseId: input.reusableProviderLeaseId,
        });
        if (resumedLease) {
            return resumedLease;
        }
    }
    return await provider.acquireLease({
        config: input.config,
        environmentId: input.environmentId,
        heartbeatRunId: input.heartbeatRunId,
        issueId: input.issueId,
    });
}
export async function resumeSandboxProviderLease(input) {
    return await requireSandboxProvider(input.config.provider).resumeLease(input);
}
export async function releaseSandboxProviderLease(input) {
    await requireSandboxProvider(input.config.provider).releaseLease(input);
}
export async function destroySandboxProviderLease(input) {
    await requireSandboxProvider(input.config.provider).destroyLease(input);
}
//# sourceMappingURL=sandbox-provider-runtime.js.map