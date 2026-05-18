import type { Db } from "@paperclipai/db";
import { type CompanySearchQuery, type CompanySearchResponse } from "@paperclipai/shared";
export declare const COMPANY_SEARCH_BRANCH_FETCH_LIMIT: number;
export declare function companySearchBranchFetchLimit(limit: number, offset?: number): number;
export declare function companySearchService(db: Db): {
    search: (companyId: string, query: CompanySearchQuery) => Promise<CompanySearchResponse>;
};
//# sourceMappingURL=company-search.d.ts.map