import type { Db } from "@paperclipai/db";
import type { CompanyPortabilityExport, CompanyPortabilityExportPreviewResult, CompanyPortabilityExportResult, CompanyPortabilityImport, CompanyPortabilityImportResult, CompanyPortabilityPreview, CompanyPortabilityPreviewResult } from "@paperclipai/shared";
import type { StorageService } from "../storage/types.js";
type ImportMode = "board_full" | "agent_safe";
type ImportBehaviorOptions = {
    mode?: ImportMode;
    sourceCompanyId?: string | null;
};
export declare function parseGitHubSourceUrl(rawUrl: string): {
    hostname: string;
    owner: string;
    repo: string;
    ref: string;
    basePath: string;
    companyPath: string;
};
export declare function companyPortabilityService(db: Db, storage?: StorageService): {
    exportBundle: (companyId: string, input: CompanyPortabilityExport) => Promise<CompanyPortabilityExportResult>;
    previewExport: (companyId: string, input: CompanyPortabilityExport) => Promise<CompanyPortabilityExportPreviewResult>;
    previewImport: (input: CompanyPortabilityPreview, options?: ImportBehaviorOptions) => Promise<CompanyPortabilityPreviewResult>;
    importBundle: (input: CompanyPortabilityImport, actorUserId: string | null | undefined, options?: ImportBehaviorOptions) => Promise<CompanyPortabilityImportResult>;
};
export {};
//# sourceMappingURL=company-portability.d.ts.map