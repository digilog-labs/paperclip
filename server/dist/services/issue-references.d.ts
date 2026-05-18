import type { Db } from "@paperclipai/db";
import type { IssueRelatedWorkSummary, IssueRelationIssueSummary } from "@paperclipai/shared";
declare function emptySummary(): IssueRelatedWorkSummary;
declare function diffIssueSummaries(before: IssueRelatedWorkSummary, after: IssueRelatedWorkSummary): {
    addedReferencedIssues: IssueRelationIssueSummary[];
    removedReferencedIssues: IssueRelationIssueSummary[];
    currentReferencedIssues: IssueRelationIssueSummary[];
};
export declare function issueReferenceService(db: Db): {
    syncIssue: (issueId: string, dbOrTx?: any) => Promise<void>;
    syncComment: (commentId: string, dbOrTx?: any) => Promise<void>;
    syncDocument: (documentId: string, dbOrTx?: any) => Promise<void>;
    deleteDocumentSource: (documentId: string, dbOrTx?: any) => Promise<void>;
    syncAllForIssue: (issueId: string, dbOrTx?: any) => Promise<void>;
    syncAllForCompany: (companyId: string, dbOrTx?: any) => Promise<void>;
    listIssueReferenceSummary: (issueId: string, dbOrTx?: any) => Promise<IssueRelatedWorkSummary>;
    diffIssueReferenceSummary: typeof diffIssueSummaries;
    emptySummary: typeof emptySummary;
};
export {};
//# sourceMappingURL=issue-references.d.ts.map