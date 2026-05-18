import type { Db } from "@paperclipai/db";
import type { PaperclipPluginManifestV1, PluginManagedAgentResolution } from "@paperclipai/shared";
interface PluginManagedAgentServiceOptions {
    pluginId: string;
    pluginKey: string;
    manifest?: PaperclipPluginManifestV1 | null;
    instructionTemplateVariables?: (companyId: string) => Promise<Record<string, string | null | undefined>>;
}
export declare function pluginManagedAgentService(db: Db, options: PluginManagedAgentServiceOptions): {
    get: (agentKey: string, companyId: string) => Promise<PluginManagedAgentResolution>;
    reconcile: (agentKey: string, companyId: string) => Promise<PluginManagedAgentResolution>;
    reset: (agentKey: string, companyId: string) => Promise<PluginManagedAgentResolution>;
};
export {};
//# sourceMappingURL=plugin-managed-agents.d.ts.map