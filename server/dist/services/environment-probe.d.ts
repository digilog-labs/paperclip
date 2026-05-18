import type { Environment, EnvironmentProbeResult } from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";
import { type ParsedEnvironmentConfig } from "./environment-config.js";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
export declare function probeEnvironment(db: Db, environment: Environment, options?: {
    pluginWorkerManager?: PluginWorkerManager;
    resolvedConfig?: ParsedEnvironmentConfig;
}): Promise<EnvironmentProbeResult>;
//# sourceMappingURL=environment-probe.d.ts.map