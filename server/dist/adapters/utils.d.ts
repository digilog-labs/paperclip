import type { ChildProcess } from "node:child_process";
import * as serverUtils from "@paperclipai/adapter-utils/server-utils";
export type { RunProcessResult } from "@paperclipai/adapter-utils/server-utils";
type BuildInvocationEnvForLogsOptions = {
    runtimeEnv?: NodeJS.ProcessEnv | Record<string, string>;
    includeRuntimeKeys?: string[];
    resolvedCommand?: string | null;
    resolvedCommandEnvKey?: string;
};
export declare const runningProcesses: Map<string, {
    child: ChildProcess;
    graceSec: number;
    processGroupId: number | null;
}>;
export declare const MAX_CAPTURE_BYTES: number;
export declare const MAX_EXCERPT_BYTES: number;
export declare const parseObject: typeof serverUtils.parseObject;
export declare const asString: typeof serverUtils.asString;
export declare const asNumber: typeof serverUtils.asNumber;
export declare const asBoolean: typeof serverUtils.asBoolean;
export declare const asStringArray: typeof serverUtils.asStringArray;
export declare const parseJson: typeof serverUtils.parseJson;
export declare const appendWithCap: typeof serverUtils.appendWithCap;
export declare const appendWithByteCap: typeof serverUtils.appendWithByteCap;
export declare const resolvePathValue: typeof serverUtils.resolvePathValue;
export declare const renderTemplate: typeof serverUtils.renderTemplate;
export declare const redactEnvForLogs: typeof serverUtils.redactEnvForLogs;
export declare const buildPaperclipEnv: typeof serverUtils.buildPaperclipEnv;
export declare const defaultPathForPlatform: typeof serverUtils.defaultPathForPlatform;
export declare const ensurePathInEnv: typeof serverUtils.ensurePathInEnv;
export declare const ensureAbsoluteDirectory: typeof serverUtils.ensureAbsoluteDirectory;
export declare const ensureCommandResolvable: typeof serverUtils.ensureCommandResolvable;
export declare const resolveCommandForLogs: typeof serverUtils.resolveCommandForLogs;
export declare function buildInvocationEnvForLogs(env: Record<string, string>, options?: BuildInvocationEnvForLogsOptions): Record<string, string>;
import type { RunProcessResult } from "@paperclipai/adapter-utils/server-utils";
export declare function runChildProcess(runId: string, command: string, args: string[], opts: {
    cwd: string;
    env: Record<string, string>;
    timeoutSec: number;
    graceSec: number;
    onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}): Promise<RunProcessResult>;
//# sourceMappingURL=utils.d.ts.map