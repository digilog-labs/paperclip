import type { Db } from "@paperclipai/db";
import type { PaperclipPluginManifestV1, PluginManagedSkillResolution } from "@paperclipai/shared";
interface PluginManagedSkillServiceOptions {
    pluginId: string;
    pluginKey: string;
    manifest?: PaperclipPluginManifestV1 | null;
}
export declare function pluginManagedSkillService(db: Db, options: PluginManagedSkillServiceOptions): {
    get: (skillKey: string, companyId: string) => Promise<PluginManagedSkillResolution>;
    reconcile: (skillKey: string, companyId: string) => Promise<PluginManagedSkillResolution>;
    reset: (skillKey: string, companyId: string) => Promise<PluginManagedSkillResolution>;
};
export {};
//# sourceMappingURL=plugin-managed-skills.d.ts.map