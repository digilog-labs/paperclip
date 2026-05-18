import type { Db } from "@paperclipai/db";
import type { PaperclipSkillEntry } from "@paperclipai/adapter-utils/server-utils";
import type { CompanySkill, CompanySkillCreateRequest, CompanySkillCompatibility, CompanySkillDetail, CompanySkillFileDetail, CompanySkillFileInventoryEntry, CompanySkillImportResult, CompanySkillListItem, CompanySkillProjectScanRequest, CompanySkillProjectScanResult, CompanySkillSourceType, CompanySkillTrustLevel, CompanySkillUpdateStatus } from "@paperclipai/shared";
type ImportedSkill = {
    key: string;
    slug: string;
    name: string;
    description: string | null;
    markdown: string;
    packageDir?: string | null;
    sourceType: CompanySkillSourceType;
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: CompanySkillTrustLevel;
    compatibility: CompanySkillCompatibility;
    fileInventory: CompanySkillFileInventoryEntry[];
    metadata: Record<string, unknown> | null;
};
type PackageSkillConflictStrategy = "replace" | "rename" | "skip";
export type ImportPackageSkillResult = {
    skill: CompanySkill;
    action: "created" | "updated" | "skipped";
    originalKey: string;
    originalSlug: string;
    requestedRefs: string[];
    reason: string | null;
};
type ParsedSkillImportSource = {
    resolvedSource: string;
    requestedSkillSlug: string | null;
    originalSkillsShUrl: string | null;
    warnings: string[];
};
export type LocalSkillInventoryMode = "full" | "project_root";
export type ProjectSkillScanTarget = {
    projectId: string;
    projectName: string;
    workspaceId: string;
    workspaceName: string;
    workspaceCwd: string;
};
type RuntimeSkillEntryOptions = {
    materializeMissing?: boolean;
};
export declare function normalizeGitHubSkillDirectory(value: string | null | undefined, fallback: string): string;
export declare function parseSkillImportSourceInput(rawInput: string): ParsedSkillImportSource;
export declare function readLocalSkillImportFromDirectory(companyId: string, skillDir: string, options?: {
    inventoryMode?: LocalSkillInventoryMode;
    metadata?: Record<string, unknown> | null;
}): Promise<ImportedSkill>;
export declare function discoverProjectWorkspaceSkillDirectories(target: ProjectSkillScanTarget): Promise<Array<{
    skillDir: string;
    inventoryMode: LocalSkillInventoryMode;
}>>;
export declare function findMissingLocalSkillIds(skills: Array<Pick<CompanySkill, "id" | "sourceType" | "sourceLocator">>): Promise<string[]>;
export declare function companySkillService(db: Db): {
    list: (companyId: string) => Promise<CompanySkillListItem[]>;
    listFull: (companyId: string) => Promise<CompanySkill[]>;
    getById: (companyId: string, id: string) => Promise<CompanySkill | null>;
    getByKey: (companyId: string, key: string) => Promise<CompanySkill | null>;
    resolveRequestedSkillKeys: (companyId: string, requestedReferences: string[]) => Promise<string[]>;
    detail: (companyId: string, id: string) => Promise<CompanySkillDetail | null>;
    updateStatus: (companyId: string, skillId: string) => Promise<CompanySkillUpdateStatus | null>;
    readFile: (companyId: string, skillId: string, relativePath: string) => Promise<CompanySkillFileDetail | null>;
    updateFile: (companyId: string, skillId: string, relativePath: string, content: string) => Promise<CompanySkillFileDetail>;
    createLocalSkill: (companyId: string, input: CompanySkillCreateRequest) => Promise<CompanySkill>;
    deleteSkill: (companyId: string, skillId: string) => Promise<CompanySkill | null>;
    importFromSource: (companyId: string, source: string) => Promise<CompanySkillImportResult>;
    scanProjectWorkspaces: (companyId: string, input?: CompanySkillProjectScanRequest) => Promise<CompanySkillProjectScanResult>;
    importPackageFiles: (companyId: string, files: Record<string, string>, options?: {
        onConflict?: PackageSkillConflictStrategy;
    }) => Promise<ImportPackageSkillResult[]>;
    installUpdate: (companyId: string, skillId: string) => Promise<CompanySkill | null>;
    listRuntimeSkillEntries: (companyId: string, options?: RuntimeSkillEntryOptions) => Promise<PaperclipSkillEntry[]>;
};
export {};
//# sourceMappingURL=company-skills.d.ts.map