import type { Db } from "@paperclipai/db";
import { ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY } from "@paperclipai/shared";
export { ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY };
export declare const ISSUE_CONTINUATION_SUMMARY_TITLE = "Continuation Summary";
export declare const ISSUE_CONTINUATION_SUMMARY_MAX_BODY_CHARS = 8000;
type IssueSummaryInput = {
    id: string;
    identifier: string | null;
    title: string;
    description: string | null;
    status: string;
    priority: string;
};
type RunSummaryInput = {
    id: string;
    status: string;
    error: string | null;
    errorCode?: string | null;
    resultJson?: Record<string, unknown> | null;
    stdoutExcerpt?: string | null;
    stderrExcerpt?: string | null;
    finishedAt?: Date | null;
};
type AgentSummaryInput = {
    id: string;
    name: string;
    adapterType: string | null;
};
export type IssueContinuationSummaryDocument = {
    key: typeof ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY;
    title: string | null;
    body: string;
    latestRevisionId: string | null;
    latestRevisionNumber: number;
    updatedAt: Date;
};
export declare function extractContinuationSummaryNextAction(body: string | null | undefined): string | null;
export declare function continuationSummaryParksExecutor(body: string | null | undefined): boolean;
export declare function buildContinuationSummaryMarkdown(input: {
    issue: IssueSummaryInput;
    run: RunSummaryInput;
    agent: AgentSummaryInput;
    previousSummaryBody?: string | null;
}): string;
export declare function getIssueContinuationSummaryDocument(db: Db, issueId: string): Promise<IssueContinuationSummaryDocument | null>;
export declare function refreshIssueContinuationSummary(input: {
    db: Db;
    issueId: string;
    run: RunSummaryInput;
    agent: AgentSummaryInput;
}): Promise<{
    id: string;
    companyId: string;
    issueId: string;
    key: string;
    title: string | null;
    format: string;
    body: string;
    latestRevisionId: string;
    latestRevisionNumber: number;
    createdByAgentId: string | null;
    createdByUserId: string | null;
    updatedByAgentId: string | null;
    updatedByUserId: string | null;
    lockedAt: Date | null;
    lockedByAgentId: string | null;
    lockedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
} | null>;
//# sourceMappingURL=issue-continuation-summary.d.ts.map