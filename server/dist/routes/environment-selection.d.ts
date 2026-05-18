export declare function assertEnvironmentSelectionForCompany(environmentsSvc: {
    getById(environmentId: string): Promise<{
        id: string;
        companyId: string;
        driver: string;
        status?: string | null;
        config: Record<string, unknown> | null;
    } | null>;
}, companyId: string, environmentId: string | null | undefined, options?: {
    allowedDrivers?: string[];
    allowedSandboxProviders?: string[];
}): Promise<void>;
//# sourceMappingURL=environment-selection.d.ts.map