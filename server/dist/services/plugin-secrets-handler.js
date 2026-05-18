/**
 * Plugin secrets host-side handler — resolves secret references through the
 * Paperclip secret provider system.
 *
 * When a plugin worker calls `ctx.secrets.resolve(secretRef)`, the JSON-RPC
 * request arrives at the host with `{ secretRef }`. This module provides the
 * concrete `HostServices.secrets` adapter that:
 *
 * 1. Parses the `secretRef` string to identify the secret.
 * 2. Looks up the secret record and its latest version in the database.
 * 3. Delegates to the configured `SecretProviderModule` to decrypt /
 *    resolve the raw value.
 * 4. Returns the resolved plaintext value to the worker.
 *
 * ## Secret Reference Format
 *
 * A `secretRef` is a **secret UUID** — the primary key (`id`) of a row in
 * the `company_secrets` table. Operators place these UUIDs into plugin
 * config values; plugin workers resolve them at execution time via
 * `ctx.secrets.resolve(secretId)`.
 *
 * ## Security Invariants
 *
 * - Resolved values are **never** logged, persisted, or included in error
 *   messages (per PLUGIN_SPEC.md §22).
 * - The handler is capability-gated: only plugins with `secrets.read-ref`
 *   declared in their manifest may call it (enforced by `host-client-factory`).
 * - The host handler itself does not cache resolved values. Each call goes
 *   through the secret provider to honour rotation.
 *
 * @see PLUGIN_SPEC.md §22 — Secrets
 * @see host-client-factory.ts — capability gating
 * @see services/secrets.ts — secretService used by agent env bindings
 */
import { collectSecretRefPaths, isUuidSecretRef, readConfigValueAtPath, } from "./json-schema-secret-refs.js";
export const PLUGIN_SECRET_REFS_DISABLED_MESSAGE = "Plugin secret references are disabled until company-scoped plugin config lands";
// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------
function invalidSecretRef(secretRef) {
    const err = new Error(`Invalid secret reference: ${secretRef}`);
    err.name = "InvalidSecretRefError";
    return err;
}
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
/**
 * Extract secret reference UUIDs from a plugin's configJson, scoped to only
 * the fields annotated with `format: "secret-ref"` in the schema.
 *
 * When no schema is provided, falls back to collecting all UUID-shaped strings
 * (backwards-compatible for plugins without a declared instanceConfigSchema).
 */
export function extractSecretRefsFromConfig(configJson, schema) {
    return new Set(extractSecretRefPathsFromConfig(configJson, schema).keys());
}
export function extractSecretRefPathsFromConfig(configJson, schema) {
    const refs = new Map();
    const addRef = (secretRef, path) => {
        const existing = refs.get(secretRef) ?? new Set();
        existing.add(path);
        refs.set(secretRef, existing);
    };
    if (configJson == null || typeof configJson !== "object")
        return new Map();
    const secretPaths = collectSecretRefPaths(schema);
    // If schema declares secret-ref paths, extract only those values.
    if (secretPaths.size > 0) {
        for (const dotPath of secretPaths) {
            const current = readConfigValueAtPath(configJson, dotPath);
            if (typeof current === "string" && isUuidSecretRef(current)) {
                addRef(current, dotPath);
            }
        }
        return refs;
    }
    // Fallback: no schema or no secret-ref annotations — collect all UUIDs.
    // This preserves backwards compatibility for plugins that omit
    // instanceConfigSchema.
    function walkAll(value) {
        if (typeof value === "string") {
            if (isUuidSecretRef(value))
                addRef(value, "$");
        }
        else if (Array.isArray(value)) {
            for (const item of value)
                walkAll(item);
        }
        else if (value !== null && typeof value === "object") {
            for (const v of Object.values(value))
                walkAll(v);
        }
    }
    walkAll(configJson);
    return refs;
}
/**
 * Create a `HostServices.secrets` adapter for a specific plugin.
 *
 * The returned service looks up secrets by UUID, fetches the latest version
 * material, and delegates to the appropriate `SecretProviderModule` for
 * decryption.
 *
 * @example
 * ```ts
 * const secretsHandler = createPluginSecretsHandler({ db, pluginId });
 * const handlers = createHostClientHandlers({
 *   pluginId,
 *   capabilities: manifest.capabilities,
 *   services: {
 *     secrets: secretsHandler,
 *     // ...
 *   },
 * });
 * ```
 *
 * @param options - Database connection and plugin identity
 * @returns A `PluginSecretsService` suitable for `HostServices.secrets`
 */
/** Simple sliding-window rate limiter for secret resolution attempts. */
function createRateLimiter(maxAttempts, windowMs) {
    const attempts = new Map();
    return {
        check(key) {
            const now = Date.now();
            const windowStart = now - windowMs;
            const existing = (attempts.get(key) ?? []).filter((ts) => ts > windowStart);
            if (existing.length >= maxAttempts)
                return false;
            existing.push(now);
            attempts.set(key, existing);
            return true;
        },
    };
}
export function createPluginSecretsHandler(options) {
    const { pluginId } = options;
    // Rate limit: max 30 resolution attempts per plugin per minute
    const rateLimiter = createRateLimiter(30, 60_000);
    return {
        async resolve(params) {
            const { secretRef } = params;
            // ---------------------------------------------------------------
            // 0. Rate limiting — prevent brute-force UUID enumeration
            // ---------------------------------------------------------------
            if (!rateLimiter.check(pluginId)) {
                const err = new Error("Rate limit exceeded for secret resolution");
                err.name = "RateLimitExceededError";
                throw err;
            }
            // ---------------------------------------------------------------
            // 1. Validate the ref format
            // ---------------------------------------------------------------
            if (!secretRef || typeof secretRef !== "string" || secretRef.trim().length === 0) {
                throw invalidSecretRef(secretRef ?? "<empty>");
            }
            const trimmedRef = secretRef.trim();
            if (!isUuidSecretRef(trimmedRef)) {
                throw invalidSecretRef(trimmedRef);
            }
            // Fail closed until plugin config and worker runtime both carry an
            // explicit company scope for secret bindings and resolution.
            throw new Error(PLUGIN_SECRET_REFS_DISABLED_MESSAGE);
        },
    };
}
//# sourceMappingURL=plugin-secrets-handler.js.map