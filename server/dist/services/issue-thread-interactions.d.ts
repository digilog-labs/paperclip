import type { Db } from "@paperclipai/db";
import { issueThreadInteractions } from "@paperclipai/db";
import type { AcceptIssueThreadInteraction, CancelIssueThreadInteraction, CreateIssueThreadInteraction, IssueThreadInteraction, RejectIssueThreadInteraction, RespondIssueThreadInteraction } from "@paperclipai/shared";
type InteractionActor = {
    agentId?: string | null;
    userId?: string | null;
};
type IssueWakeTarget = {
    id: string;
    assigneeAgentId: string | null;
    assigneeUserId?: string | null;
    status: string;
};
type ResolvedInteractionResult = {
    interaction: IssueThreadInteraction;
    createdIssues: IssueWakeTarget[];
    continuationIssue?: IssueWakeTarget | null;
};
type IssueThreadInteractionRow = typeof issueThreadInteractions.$inferSelect;
export declare function issueThreadInteractionService(db: Db): {
    listForIssue: (issueId: string) => Promise<IssueThreadInteraction[]>;
    getById: (interactionId: string) => Promise<IssueThreadInteraction | null>;
    create: (issue: {
        id: string;
        companyId: string;
    }, input: CreateIssueThreadInteraction, actor: InteractionActor) => Promise<IssueThreadInteraction>;
    acceptInteraction: (issue: {
        id: string;
        companyId: string;
        projectId: string | null;
        goalId: string | null;
    }, interactionId: string, input: AcceptIssueThreadInteraction, actor: InteractionActor) => Promise<ResolvedInteractionResult>;
    acceptSuggestedTasks: (issue: {
        id: string;
        companyId: string;
        projectId: string | null;
        goalId: string | null;
    }, interactionId: string, input: AcceptIssueThreadInteraction, actor: InteractionActor) => Promise<{
        interaction: IssueThreadInteraction;
        createdIssues: IssueWakeTarget[];
    }>;
    rejectInteraction: (issue: {
        id: string;
        companyId: string;
    }, interactionId: string, input: RejectIssueThreadInteraction, actor: InteractionActor) => Promise<IssueThreadInteraction>;
    rejectSuggestedTasks: (issue: {
        id: string;
        companyId: string;
    }, interactionId: string, input: RejectIssueThreadInteraction, actor: InteractionActor, current: IssueThreadInteractionRow) => Promise<IssueThreadInteraction>;
    expireRequestConfirmationsSupersededByComment: (issue: {
        id: string;
        companyId: string;
    }, comment: {
        id: string;
        authorUserId?: string | null;
    }, actor: InteractionActor) => Promise<IssueThreadInteraction[]>;
    expireStaleRequestConfirmationsForIssueDocument: (issue: {
        id: string;
        companyId: string;
    }, document: {
        id: string;
        key: string;
        latestRevisionId?: string | null;
        latestRevisionNumber?: number | null;
    } | null, actor: InteractionActor) => Promise<IssueThreadInteraction[]>;
    answerQuestions: (issue: {
        id: string;
        companyId: string;
    }, interactionId: string, input: RespondIssueThreadInteraction, actor: InteractionActor) => Promise<IssueThreadInteraction>;
    cancelQuestions: (issue: {
        id: string;
        companyId: string;
    }, interactionId: string, input: CancelIssueThreadInteraction, actor: InteractionActor) => Promise<IssueThreadInteraction>;
};
export {};
//# sourceMappingURL=issue-thread-interactions.d.ts.map