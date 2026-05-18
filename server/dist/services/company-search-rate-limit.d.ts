export declare const COMPANY_SEARCH_RATE_LIMIT_WINDOW_MS = 60000;
export declare const COMPANY_SEARCH_RATE_LIMIT_MAX_REQUESTS = 60;
export type CompanySearchRateLimitActor = {
    companyId: string;
    actorType: "agent" | "board";
    actorId: string;
};
export type CompanySearchRateLimitResult = {
    allowed: boolean;
    limit: number;
    remaining: number;
    retryAfterSeconds: number;
};
export type CompanySearchRateLimiter = {
    consume(actor: CompanySearchRateLimitActor): CompanySearchRateLimitResult;
};
export declare function createCompanySearchRateLimiter(options?: {
    windowMs?: number;
    maxRequests?: number;
    now?: () => number;
}): CompanySearchRateLimiter;
//# sourceMappingURL=company-search-rate-limit.d.ts.map