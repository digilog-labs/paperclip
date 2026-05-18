import path from "node:path";
import { TelemetryClient, resolveTelemetryConfig, loadOrCreateState, } from "@paperclipai/shared/telemetry";
import { resolvePaperclipInstanceRoot } from "./home-paths.js";
import { serverVersion } from "./version.js";
let client = null;
export function initTelemetry(fileConfig) {
    if (client)
        return client;
    const config = resolveTelemetryConfig(fileConfig);
    if (!config.enabled)
        return null;
    const stateDir = path.join(resolvePaperclipInstanceRoot(), "telemetry");
    client = new TelemetryClient(config, () => loadOrCreateState(stateDir, serverVersion), serverVersion);
    client.startPeriodicFlush(60_000);
    return client;
}
export function getTelemetryClient() {
    return client;
}
//# sourceMappingURL=telemetry.js.map