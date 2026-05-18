type BundleMode = "managed" | "external";
type AgentLike = {
    id: string;
    companyId: string;
    name: string;
    adapterConfig: unknown;
};
type AgentInstructionsFileSummary = {
    path: string;
    size: number;
    language: string;
    markdown: boolean;
    isEntryFile: boolean;
    editable: boolean;
    deprecated: boolean;
    virtual: boolean;
};
type AgentInstructionsFileDetail = AgentInstructionsFileSummary & {
    content: string;
    editable: boolean;
};
type AgentInstructionsBundle = {
    agentId: string;
    companyId: string;
    mode: BundleMode | null;
    rootPath: string | null;
    managedRootPath: string;
    entryFile: string;
    resolvedEntryPath: string | null;
    editable: boolean;
    warnings: string[];
    legacyPromptTemplateActive: boolean;
    legacyBootstrapPromptTemplateActive: boolean;
    files: AgentInstructionsFileSummary[];
};
type BundleState = {
    config: Record<string, unknown>;
    mode: BundleMode | null;
    rootPath: string | null;
    entryFile: string;
    resolvedEntryPath: string | null;
    warnings: string[];
    legacyPromptTemplateActive: boolean;
    legacyBootstrapPromptTemplateActive: boolean;
};
export declare function syncInstructionsBundleConfigFromFilePath(agent: AgentLike, adapterConfig: Record<string, unknown>): Record<string, unknown>;
export declare function agentInstructionsService(): {
    getBundle: (agent: AgentLike) => Promise<AgentInstructionsBundle>;
    readFile: (agent: AgentLike, relativePath: string) => Promise<AgentInstructionsFileDetail>;
    updateBundle: (agent: AgentLike, input: {
        mode?: BundleMode;
        rootPath?: string | null;
        entryFile?: string;
        clearLegacyPromptTemplate?: boolean;
    }) => Promise<{
        bundle: AgentInstructionsBundle;
        adapterConfig: Record<string, unknown>;
    }>;
    writeFile: (agent: AgentLike, relativePath: string, content: string, options?: {
        clearLegacyPromptTemplate?: boolean;
    }) => Promise<{
        bundle: AgentInstructionsBundle;
        file: AgentInstructionsFileDetail;
        adapterConfig: Record<string, unknown>;
    }>;
    deleteFile: (agent: AgentLike, relativePath: string) => Promise<{
        bundle: AgentInstructionsBundle;
        adapterConfig: Record<string, unknown>;
    }>;
    exportFiles: (agent: AgentLike) => Promise<{
        files: Record<string, string>;
        entryFile: string;
        warnings: string[];
    }>;
    ensureManagedBundle: (agent: AgentLike, options?: {
        clearLegacyPromptTemplate?: boolean;
    }) => Promise<{
        adapterConfig: Record<string, unknown>;
        state: BundleState;
    }>;
    materializeManagedBundle: (agent: AgentLike, files: Record<string, string>, options?: {
        clearLegacyPromptTemplate?: boolean;
        replaceExisting?: boolean;
        entryFile?: string;
    }) => Promise<{
        bundle: AgentInstructionsBundle;
        adapterConfig: Record<string, unknown>;
    }>;
};
export {};
//# sourceMappingURL=agent-instructions.d.ts.map