import { z } from "zod";
import { randomUUID } from "node:crypto";
import { unprocessable } from "../errors.js";
import { parseObject } from "../adapters/utils.js";
import { secretService } from "./secrets.js";
import { resolvePluginSandboxProviderDriverByKey, validatePluginEnvironmentDriverConfig, validatePluginSandboxProviderConfig, } from "./plugin-environment-driver.js";
import { collectSecretRefPaths, isUuidSecretRef, readConfigValueAtPath, writeConfigValueAtPath, } from "./json-schema-secret-refs.js";
const secretRefSchema = z.object({
    type: z.literal("secret_ref"),
    secretId: z.string().uuid(),
    version: z.union([z.literal("latest"), z.number().int().positive()]).optional().default("latest"),
}).strict();
const sshEnvironmentConfigSchema = z.object({
    host: z.string({ required_error: "SSH environments require a host." }).trim().min(1, "SSH environments require a host."),
    port: z.coerce.number().int().min(1).max(65535).default(22),
    username: z.string({ required_error: "SSH environments require a username." }).trim().min(1, "SSH environments require a username."),
    remoteWorkspacePath: z
        .string({ required_error: "SSH environments require a remote workspace path." })
        .trim()
        .min(1, "SSH environments require a remote workspace path.")
        .refine((value) => value.startsWith("/"), "SSH remote workspace path must be absolute."),
    privateKey: z.null().optional().default(null),
    privateKeySecretRef: secretRefSchema.optional().nullable().default(null),
    knownHosts: z
        .string()
        .trim()
        .optional()
        .nullable()
        .transform((value) => (value && value.length > 0 ? value : null)),
    strictHostKeyChecking: z.boolean().optional().default(true),
}).strict();
const sshEnvironmentConfigProbeSchema = sshEnvironmentConfigSchema.extend({
    privateKey: z
        .string()
        .trim()
        .optional()
        .nullable()
        .transform((value) => (value && value.length > 0 ? value : null)),
}).strict();
const sshEnvironmentConfigPersistenceSchema = sshEnvironmentConfigProbeSchema;
const fakeSandboxEnvironmentConfigSchema = z.object({
    provider: z.literal("fake").default("fake"),
    image: z
        .string()
        .trim()
        .min(1, "Fake sandbox environments require an image.")
        .default("ubuntu:24.04"),
    reuseLease: z.boolean().optional().default(false),
}).strict();
const pluginSandboxProviderKeySchema = z.string()
    .trim()
    .min(1, "Sandbox provider is required.")
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Sandbox provider key must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, hyphens, or underscores");
const pluginSandboxEnvironmentConfigSchema = z.object({
    provider: pluginSandboxProviderKeySchema,
    timeoutMs: z.coerce.number().int().min(1).max(86_400_000).optional(),
    reuseLease: z.boolean().optional().default(false),
}).catchall(z.unknown());
const pluginEnvironmentConfigSchema = z.object({
    pluginKey: z.string().min(1),
    driverKey: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/, "Environment driver key must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, hyphens, or underscores"),
    driverConfig: z.record(z.unknown()).optional().default({}),
}).strict();
function toErrorMessage(error) {
    const first = error.issues[0];
    if (!first)
        return "Invalid environment config.";
    return first.message;
}
function getSandboxProvider(raw) {
    return typeof raw.provider === "string" && raw.provider.trim().length > 0 ? raw.provider.trim() : "fake";
}
function parseSandboxEnvironmentConfig(input) {
    const raw = parseObject(input);
    const provider = getSandboxProvider(raw);
    if (provider === "fake") {
        const parsed = fakeSandboxEnvironmentConfigSchema.safeParse(raw);
        return parsed.success
            ? ({ success: true, data: parsed.data })
            : ({ success: false, error: parsed.error });
    }
    const parsed = pluginSandboxEnvironmentConfigSchema.safeParse(raw);
    return parsed.success
        ? ({ success: true, data: parsed.data })
        : ({ success: false, error: parsed.error });
}
async function getSandboxProviderConfigSchema(db, provider) {
    const resolved = await resolvePluginSandboxProviderDriverByKey({
        db,
        driverKey: provider,
    });
    const schema = resolved?.driver.configSchema;
    return schema && typeof schema === "object" && !Array.isArray(schema)
        ? schema
        : null;
}
function secretName(input) {
    const slug = input.environmentName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "environment";
    return `environment-${input.driver}-${slug}-${input.field}-${randomUUID().slice(0, 8)}`;
}
async function createEnvironmentSecret(input) {
    const created = await secretService(input.db).create(input.companyId, {
        name: secretName(input),
        provider: input.provider,
        value: input.value,
        description: `Secret for ${input.environmentName} ${input.field}.`,
    }, input.actor);
    return {
        type: "secret_ref",
        secretId: created.id,
        version: "latest",
    };
}
async function persistConfigSecretRefs(input) {
    let nextConfig = { ...input.config };
    for (const path of collectSecretRefPaths(input.schema)) {
        const rawValue = readConfigValueAtPath(nextConfig, path);
        if (typeof rawValue !== "string")
            continue;
        const trimmed = rawValue.trim();
        if (trimmed.length === 0) {
            nextConfig = writeConfigValueAtPath(nextConfig, path, undefined);
            continue;
        }
        if (isUuidSecretRef(trimmed)) {
            nextConfig = writeConfigValueAtPath(nextConfig, path, trimmed);
            continue;
        }
        const created = await createEnvironmentSecret({
            db: input.db,
            companyId: input.companyId,
            environmentName: input.environmentName,
            driver: input.driver,
            field: path.replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
            provider: input.secretProvider,
            value: trimmed,
            actor: input.actor,
        });
        nextConfig = writeConfigValueAtPath(nextConfig, path, created.secretId);
    }
    return nextConfig;
}
async function resolveConfigSecretRefsForRuntime(input) {
    const secrets = secretService(input.db);
    let nextConfig = { ...input.config };
    for (const path of collectSecretRefPaths(input.schema)) {
        const current = readConfigValueAtPath(nextConfig, path);
        if (typeof current !== "string")
            continue;
        const trimmed = current.trim();
        if (!isUuidSecretRef(trimmed))
            continue;
        if (!input.context.consumerId) {
            throw unprocessable("Runtime secret resolution requires an environment id");
        }
        nextConfig = writeConfigValueAtPath(nextConfig, path, await secrets.resolveSecretValue(input.companyId, trimmed, "latest", {
            consumerType: "environment",
            consumerId: input.context.consumerId,
            actorType: "system",
            actorId: null,
            issueId: input.context.issueId ?? null,
            heartbeatRunId: input.context.heartbeatRunId ?? null,
            configPath: path,
        }));
    }
    return nextConfig;
}
export async function collectEnvironmentSecretRefs(input) {
    const parsed = parseEnvironmentDriverConfig(input.environment);
    if (parsed.driver === "ssh" && parsed.config.privateKeySecretRef) {
        return [{
                secretId: parsed.config.privateKeySecretRef.secretId,
                configPath: "privateKeySecretRef",
                versionSelector: parsed.config.privateKeySecretRef.version ?? "latest",
            }];
    }
    if (parsed.driver === "sandbox" && parsed.config.provider !== "fake") {
        const schema = await getSandboxProviderConfigSchema(input.db, parsed.config.provider);
        const refs = [];
        for (const path of collectSecretRefPaths(schema)) {
            const current = readConfigValueAtPath(parsed.config, path);
            if (typeof current === "string" && isUuidSecretRef(current.trim())) {
                refs.push({ secretId: current.trim(), configPath: path, versionSelector: "latest" });
            }
        }
        return refs;
    }
    return [];
}
export function stripSandboxProviderEnvelope(config) {
    const { provider: _provider, ...driverConfig } = config;
    return driverConfig;
}
export function normalizeEnvironmentConfig(input) {
    if (input.driver === "local") {
        return { ...parseObject(input.config) };
    }
    if (input.driver === "ssh") {
        const parsed = sshEnvironmentConfigSchema.safeParse(parseObject(input.config));
        if (!parsed.success) {
            throw unprocessable(toErrorMessage(parsed.error), {
                issues: parsed.error.issues,
            });
        }
        return parsed.data;
    }
    if (input.driver === "sandbox") {
        const parsed = parseSandboxEnvironmentConfig(input.config);
        if (!parsed.success) {
            throw unprocessable(toErrorMessage(parsed.error), {
                issues: parsed.error.issues,
            });
        }
        return parsed.data;
    }
    if (input.driver === "plugin") {
        const parsed = pluginEnvironmentConfigSchema.safeParse(parseObject(input.config));
        if (!parsed.success) {
            throw unprocessable(toErrorMessage(parsed.error), {
                issues: parsed.error.issues,
            });
        }
        return parsed.data;
    }
    throw unprocessable(`Unsupported environment driver "${input.driver}".`);
}
export function normalizeEnvironmentConfigForProbe(input) {
    if (input.driver === "ssh") {
        const parsed = sshEnvironmentConfigProbeSchema.safeParse(parseObject(input.config));
        if (!parsed.success) {
            throw unprocessable(toErrorMessage(parsed.error), {
                issues: parsed.error.issues,
            });
        }
        return parsed.data;
    }
    if (input.driver === "sandbox") {
        const parsed = parseSandboxEnvironmentConfig(input.config);
        if (!parsed.success) {
            throw unprocessable(toErrorMessage(parsed.error), {
                issues: parsed.error.issues,
            });
        }
        if (parsed.data.provider === "fake") {
            return parsed.data;
        }
        if (!input.pluginWorkerManager) {
            throw unprocessable("Sandbox provider config validation requires a running plugin worker manager.");
        }
        return validatePluginSandboxProviderConfig({
            db: input.db,
            workerManager: input.pluginWorkerManager,
            provider: parsed.data.provider,
            config: stripSandboxProviderEnvelope(parsed.data),
        }).then((validated) => ({
            provider: parsed.data.provider,
            ...validated.normalizedConfig,
        }));
    }
    return normalizeEnvironmentConfig({
        driver: input.driver,
        config: input.config,
    });
}
export async function normalizeEnvironmentConfigForPersistence(input) {
    if (input.driver === "ssh") {
        const parsed = sshEnvironmentConfigPersistenceSchema.safeParse(parseObject(input.config));
        if (!parsed.success) {
            throw unprocessable(toErrorMessage(parsed.error), {
                issues: parsed.error.issues,
            });
        }
        const secrets = secretService(input.db);
        const { privateKey, ...stored } = parsed.data;
        let nextPrivateKeySecretRef = stored.privateKeySecretRef;
        if (privateKey) {
            nextPrivateKeySecretRef = await createEnvironmentSecret({
                db: input.db,
                companyId: input.companyId,
                environmentName: input.environmentName,
                driver: input.driver,
                field: "private-key",
                provider: input.secretProvider,
                value: privateKey,
                actor: input.actor,
            });
            if (stored.privateKeySecretRef &&
                stored.privateKeySecretRef.secretId !== nextPrivateKeySecretRef.secretId) {
                await secrets.remove(stored.privateKeySecretRef.secretId);
            }
        }
        return {
            ...stored,
            privateKey: null,
            privateKeySecretRef: nextPrivateKeySecretRef,
        };
    }
    if (input.driver === "sandbox") {
        const parsed = parseSandboxEnvironmentConfig(input.config);
        if (!parsed.success) {
            throw unprocessable(toErrorMessage(parsed.error), {
                issues: parsed.error.issues,
            });
        }
        if (parsed.data.provider === "fake") {
            throw unprocessable("Built-in fake sandbox environments are reserved for internal probes and cannot be saved.");
        }
        if (!input.pluginWorkerManager) {
            throw unprocessable("Sandbox provider config validation requires a running plugin worker manager.");
        }
        const validated = await validatePluginSandboxProviderConfig({
            db: input.db,
            workerManager: input.pluginWorkerManager,
            provider: parsed.data.provider,
            config: stripSandboxProviderEnvelope(parsed.data),
        });
        return await persistConfigSecretRefs({
            db: input.db,
            companyId: input.companyId,
            environmentName: input.environmentName,
            driver: input.driver,
            secretProvider: input.secretProvider,
            config: {
                provider: parsed.data.provider,
                ...validated.normalizedConfig,
            },
            schema: validated.driver.configSchema && typeof validated.driver.configSchema === "object" && !Array.isArray(validated.driver.configSchema)
                ? validated.driver.configSchema
                : null,
            actor: input.actor,
        });
    }
    if (input.driver === "plugin") {
        const parsed = pluginEnvironmentConfigSchema.safeParse(parseObject(input.config));
        if (!parsed.success) {
            throw unprocessable(toErrorMessage(parsed.error), {
                issues: parsed.error.issues,
            });
        }
        if (!input.pluginWorkerManager) {
            throw unprocessable("Plugin environment config validation requires a running plugin worker manager.");
        }
        return { ...(await validatePluginEnvironmentDriverConfig({
                db: input.db,
                workerManager: input.pluginWorkerManager,
                config: parsed.data,
            })) };
    }
    return normalizeEnvironmentConfig({
        driver: input.driver,
        config: input.config,
    });
}
export async function resolveEnvironmentDriverConfigForRuntime(db, companyId, environment, context) {
    const parsed = parseEnvironmentDriverConfig(environment);
    const secrets = secretService(db);
    const environmentId = environment.id;
    if (parsed.driver === "ssh" && parsed.config.privateKeySecretRef && !environmentId) {
        throw unprocessable("Runtime secret resolution requires an environment id");
    }
    if (parsed.driver === "ssh" && parsed.config.privateKeySecretRef) {
        return {
            driver: "ssh",
            config: {
                ...parsed.config,
                privateKey: await secrets.resolveSecretValue(companyId, parsed.config.privateKeySecretRef.secretId, parsed.config.privateKeySecretRef.version ?? "latest", {
                    consumerType: "environment",
                    consumerId: environmentId,
                    actorType: "system",
                    actorId: null,
                    issueId: context?.issueId ?? null,
                    heartbeatRunId: context?.heartbeatRunId ?? null,
                    configPath: "privateKeySecretRef",
                }),
            },
        };
    }
    if (parsed.driver === "sandbox" && parsed.config.provider !== "fake") {
        return {
            driver: "sandbox",
            config: await resolveConfigSecretRefsForRuntime({
                db,
                companyId,
                config: parsed.config,
                schema: await getSandboxProviderConfigSchema(db, parsed.config.provider),
                context: {
                    consumerId: environmentId,
                    issueId: context?.issueId ?? null,
                    heartbeatRunId: context?.heartbeatRunId ?? null,
                },
            }),
        };
    }
    return parsed;
}
export function readSshEnvironmentPrivateKeySecretId(environment) {
    if (environment.driver !== "ssh")
        return null;
    const parsed = sshEnvironmentConfigSchema.safeParse(parseObject(environment.config));
    if (!parsed.success)
        return null;
    return parsed.data.privateKeySecretRef?.secretId ?? null;
}
export function parseEnvironmentDriverConfig(environment) {
    if (environment.driver === "local") {
        return {
            driver: "local",
            config: { ...parseObject(environment.config) },
        };
    }
    if (environment.driver === "ssh") {
        const parsed = sshEnvironmentConfigSchema.parse(parseObject(environment.config));
        return {
            driver: "ssh",
            config: parsed,
        };
    }
    if (environment.driver === "sandbox") {
        const parsed = parseSandboxEnvironmentConfig(environment.config);
        if (!parsed.success) {
            throw parsed.error;
        }
        return {
            driver: "sandbox",
            config: parsed.data,
        };
    }
    if (environment.driver === "plugin") {
        const parsed = pluginEnvironmentConfigSchema.parse(parseObject(environment.config));
        return {
            driver: "plugin",
            config: parsed,
        };
    }
    throw new Error(`Unsupported environment driver "${environment.driver}".`);
}
//# sourceMappingURL=environment-config.js.map