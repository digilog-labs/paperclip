import { adapterExecutionTargetToRemoteSpec, } from "@paperclipai/adapter-utils/execution-target";
import { parseObject } from "../adapters/utils.js";
import { resolveEnvironmentDriverConfigForRuntime } from "./environment-config.js";
export const DEFAULT_SANDBOX_REMOTE_CWD = "/tmp";
export async function resolveEnvironmentExecutionTarget(input) {
    if (input.environment.driver === "local") {
        return {
            kind: "local",
            environmentId: input.environment.id ?? null,
            leaseId: input.leaseId ?? null,
        };
    }
    if (input.environment.driver === "sandbox") {
        if (input.adapterType !== "acpx_local" &&
            input.adapterType !== "codex_local" &&
            input.adapterType !== "claude_local" &&
            input.adapterType !== "gemini_local" &&
            input.adapterType !== "opencode_local" &&
            input.adapterType !== "pi_local" &&
            input.adapterType !== "cursor") {
            return null;
        }
        const parsed = await resolveEnvironmentDriverConfigForRuntime(input.db, input.companyId, {
            id: input.environment.id,
            driver: input.environment.driver,
            config: parseObject(input.environment.config),
        });
        if (parsed.driver !== "sandbox") {
            return null;
        }
        const remoteCwd = typeof input.leaseMetadata?.remoteCwd === "string" && input.leaseMetadata.remoteCwd.trim().length > 0
            ? input.leaseMetadata.remoteCwd.trim()
            : DEFAULT_SANDBOX_REMOTE_CWD;
        const timeoutMs = "timeoutMs" in parsed.config ? parsed.config.timeoutMs : null;
        const shellCommand = input.leaseMetadata?.shellCommand === "bash" || input.leaseMetadata?.shellCommand === "sh"
            ? input.leaseMetadata.shellCommand
            : null;
        return {
            kind: "remote",
            transport: "sandbox",
            providerKey: parsed.config.provider,
            shellCommand,
            remoteCwd,
            environmentId: input.environment.id ?? null,
            leaseId: input.leaseId ?? null,
            timeoutMs,
            runner: input.environmentRuntime && input.lease
                ? {
                    execute: async (commandInput) => {
                        const startedAt = new Date().toISOString();
                        const result = await input.environmentRuntime.execute({
                            environment: input.environment,
                            lease: input.lease,
                            command: commandInput.command,
                            args: commandInput.args,
                            cwd: commandInput.cwd ?? remoteCwd,
                            env: commandInput.env,
                            stdin: commandInput.stdin,
                            timeoutMs: commandInput.timeoutMs,
                        });
                        if (result.stdout)
                            await commandInput.onLog?.("stdout", result.stdout);
                        if (result.stderr)
                            await commandInput.onLog?.("stderr", result.stderr);
                        return {
                            exitCode: result.exitCode,
                            signal: result.signal ?? null,
                            timedOut: result.timedOut,
                            stdout: result.stdout,
                            stderr: result.stderr,
                            pid: null,
                            startedAt,
                        };
                    },
                }
                : undefined,
        };
    }
    if ((input.adapterType !== "codex_local" &&
        input.adapterType !== "acpx_local" &&
        input.adapterType !== "claude_local" &&
        input.adapterType !== "gemini_local" &&
        input.adapterType !== "opencode_local" &&
        input.adapterType !== "pi_local" &&
        input.adapterType !== "cursor") ||
        input.environment.driver !== "ssh") {
        return null;
    }
    const parsed = await resolveEnvironmentDriverConfigForRuntime(input.db, input.companyId, {
        id: input.environment.id,
        driver: input.environment.driver,
        config: parseObject(input.environment.config),
    });
    if (parsed.driver !== "ssh") {
        return null;
    }
    const remoteCwd = typeof input.leaseMetadata?.remoteCwd === "string" && input.leaseMetadata.remoteCwd.trim().length > 0
        ? input.leaseMetadata.remoteCwd.trim()
        : parsed.config.remoteWorkspacePath;
    return {
        kind: "remote",
        transport: "ssh",
        environmentId: input.environment.id ?? null,
        leaseId: input.leaseId ?? null,
        remoteCwd,
        spec: {
            host: parsed.config.host,
            port: parsed.config.port,
            username: parsed.config.username,
            remoteWorkspacePath: parsed.config.remoteWorkspacePath,
            privateKey: parsed.config.privateKey,
            knownHosts: parsed.config.knownHosts,
            strictHostKeyChecking: parsed.config.strictHostKeyChecking,
            remoteCwd,
        },
    };
}
export async function resolveEnvironmentExecutionTransport(input) {
    return adapterExecutionTargetToRemoteSpec(await resolveEnvironmentExecutionTarget(input));
}
//# sourceMappingURL=environment-execution-target.js.map