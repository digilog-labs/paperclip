import type { Db } from "@paperclipai/db";
import { type CompanySearchQuery, type CompanySearchResponse } from "@paperclipai/shared";
import type { StorageService } from "../storage/types.js";
import { type CompanySearchRateLimiter } from "../services/company-search-rate-limit.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
type CompanySearchService = {
    search(companyId: string, query: CompanySearchQuery): Promise<CompanySearchResponse>;
};
export declare function issueRoutes(db: Db, storage: StorageService, opts?: {
    feedbackExportService?: {
        flushPendingFeedbackTraces(input?: {
            companyId?: string;
            traceId?: string;
            limit?: number;
            now?: Date;
        }): Promise<unknown>;
    };
    searchService?: CompanySearchService;
    searchRateLimiter?: CompanySearchRateLimiter;
    pluginWorkerManager?: PluginWorkerManager;
}): import("express-serve-static-core").Router;
export {};
//# sourceMappingURL=issues.d.ts.map