import { logger } from "../middleware/logger.js";
import * as serverUtils from "@paperclipai/adapter-utils/server-utils";
export const runningProcesses = serverUtils.runningProcesses;
export const MAX_CAPTURE_BYTES = serverUtils.MAX_CAPTURE_BYTES;
export const MAX_EXCERPT_BYTES = serverUtils.MAX_EXCERPT_BYTES;
export const parseObject = serverUtils.parseObject;
export const asString = serverUtils.asString;
export const asNumber = serverUtils.asNumber;
export const asBoolean = serverUtils.asBoolean;
export const asStringArray = serverUtils.asStringArray;
export const parseJson = serverUtils.parseJson;
export const appendWithCap = serverUtils.appendWithCap;
export const appendWithByteCap = serverUtils.appendWithByteCap;
export const resolvePathValue = serverUtils.resolvePathValue;
export const renderTemplate = serverUtils.renderTemplate;
export const redactEnvForLogs = serverUtils.redactEnvForLogs;
export const buildPaperclipEnv = serverUtils.buildPaperclipEnv;
export const defaultPathForPlatform = serverUtils.defaultPathForPlatform;
export const ensurePathInEnv = serverUtils.ensurePathInEnv;
export const ensureAbsoluteDirectory = serverUtils.ensureAbsoluteDirectory;
export const ensureCommandResolvable = serverUtils.ensureCommandResolvable;
export const resolveCommandForLogs = serverUtils.resolveCommandForLogs;
export function buildInvocationEnvForLogs(env, options = {}) {
    const maybeBuildInvocationEnvForLogs = serverUtils.buildInvocationEnvForLogs;
    if (typeof maybeBuildInvocationEnvForLogs === "function") {
        return maybeBuildInvocationEnvForLogs(env, options);
    }
    const merged = { ...env };
    const runtimeEnv = options.runtimeEnv ?? {};
    for (const key of options.includeRuntimeKeys ?? []) {
        if (key in merged)
            continue;
        const value = runtimeEnv[key];
        if (typeof value !== "string" || value.length === 0)
            continue;
        merged[key] = value;
    }
    const resolvedCommand = options.resolvedCommand?.trim();
    if (resolvedCommand) {
        merged[options.resolvedCommandEnvKey ?? "PAPERCLIP_RESOLVED_COMMAND"] =
            serverUtils.redactCommandTextForLogs(resolvedCommand);
    }
    return redactEnvForLogs(merged);
}
const _runChildProcess = serverUtils.runChildProcess;
export async function runChildProcess(runId, command, args, opts) {
    return _runChildProcess(runId, command, args, {
        ...opts,
        onLogError: (err, id, msg) => logger.warn({ err, runId: id }, msg),
    });
}
//# sourceMappingURL=utils.js.map