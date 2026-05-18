import type { Db } from "@paperclipai/db";
import { type InstanceGeneralSettings, type InstanceExperimentalSettings, type PatchInstanceGeneralSettings, type InstanceSettings, type PatchInstanceExperimentalSettings } from "@paperclipai/shared";
export declare function instanceSettingsService(db: Db): {
    get: () => Promise<InstanceSettings>;
    getGeneral: () => Promise<InstanceGeneralSettings>;
    getExperimental: () => Promise<InstanceExperimentalSettings>;
    updateGeneral: (patch: PatchInstanceGeneralSettings) => Promise<InstanceSettings>;
    updateExperimental: (patch: PatchInstanceExperimentalSettings) => Promise<InstanceSettings>;
    listCompanyIds: () => Promise<string[]>;
};
//# sourceMappingURL=instance-settings.d.ts.map