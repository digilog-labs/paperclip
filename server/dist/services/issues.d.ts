import type { Db } from "@paperclipai/db";
import { issues, labels } from "@paperclipai/db";
import type { IssueCommentAuthorType, IssueCommentMetadata, IssueCommentPresentation, IssueBlockerAttention, IssueProductivityReview, IssueRelationIssueSummary } from "@paperclipai/shared";
export declare const ISSUE_LIST_DEFAULT_LIMIT = 500;
export declare const ISSUE_LIST_MAX_LIMIT = 1000;
export declare const MAX_CHILD_ISSUES_CREATED_BY_HELPER = 25;
type IssueCommentRunLogAttributionCandidate = {
    id: string;
    createdAt: Date | string;
    authorAgentId?: string | null;
    authorUserId?: string | null;
    createdByRunId?: string | null;
};
type IssueCommentRunLogAttributionRun = {
    runId: string;
    agentId: string;
    createdAt: Date | string;
    startedAt?: Date | string | null;
    finishedAt?: Date | string | null;
    logContent: string;
};
export declare function deriveIssueCommentRunLogAttribution(comments: readonly IssueCommentRunLogAttributionCandidate[], runs: readonly IssueCommentRunLogAttributionRun[]): Map<string, {
    derivedAuthorAgentId: string;
    derivedCreatedByRunId: string;
    derivedAuthorSource: "run_log_comment_post";
}>;
export interface IssueFilters {
    attention?: "blocked";
    status?: string;
    assigneeAgentId?: string;
    participantAgentId?: string;
    assigneeUserId?: string;
    touchedByUserId?: string;
    inboxArchivedByUserId?: string;
    unreadForUserId?: string;
    projectId?: string;
    workspaceId?: string;
    executionWorkspaceId?: string;
    parentId?: string;
    descendantOf?: string;
    labelId?: string;
    originKind?: string;
    originKindPrefix?: string;
    originId?: string;
    includeRoutineExecutions?: boolean;
    excludeRoutineExecutions?: boolean;
    includePluginOperations?: boolean;
    includeBlockedBy?: boolean;
    includeBlockedInboxAttention?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
}
type IssueRow = typeof issues.$inferSelect;
type IssueLabelRow = typeof labels.$inferSelect;
type IssueActiveRunRow = {
    id: string;
    status: string;
    agentId: string;
    invocationSource: string;
    triggerDetail: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
};
type IssueScheduledRetryRow = {
    runId: string;
    status: "scheduled_retry" | "queued" | "running" | "cancelled";
    agentId: string;
    agentName: string | null;
    retryOfRunId: string | null;
    scheduledRetryAt: Date | null;
    scheduledRetryAttempt: number;
    scheduledRetryReason: string | null;
    retryExhaustedReason?: string | null;
    error?: string | null;
    errorCode?: string | null;
};
type IssueWithLabels = IssueRow & {
    labels: IssueLabelRow[];
    labelIds: string[];
};
type IssueWithLabelsAndRun = IssueWithLabels & {
    activeRun: IssueActiveRunRow | null;
};
type IssueUserContextInput = {
    createdByUserId: string | null;
    assigneeUserId: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
};
type IssueCreateInput = Omit<typeof issues.$inferInsert, "companyId"> & {
    labelIds?: string[];
    blockedByIssueIds?: string[];
    inheritExecutionWorkspaceFromIssueId?: string | null;
};
type IssueChildCreateInput = IssueCreateInput & {
    acceptanceCriteria?: string[];
    blockParentUntilDone?: boolean;
    actorAgentId?: string | null;
    actorUserId?: string | null;
};
type IssueRelationSummaryMap = {
    blockedBy: IssueRelationIssueSummary[];
    blocks: IssueRelationIssueSummary[];
};
export type IssueDependencyReadiness = {
    issueId: string;
    blockerIssueIds: string[];
    unresolvedBlockerIssueIds: string[];
    unresolvedBlockerCount: number;
    allBlockersDone: boolean;
    isDependencyReady: boolean;
};
export type ChildIssueCompletionSummary = {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
    priority: string;
    assigneeAgentId: string | null;
    assigneeUserId: string | null;
    updatedAt: Date;
    summary: string | null;
};
export declare function clampIssueListLimit(limit: number): number;
/** Decodes HTML character references in a raw @mention capture so UI-encoded bodies match agent names. */
export declare function normalizeAgentMentionToken(raw: string): string;
export declare function deriveIssueUserContext(issue: IssueUserContextInput, userId: string, stats: {
    myLastCommentAt: Date | string | null;
    myLastReadAt: Date | string | null;
    lastExternalCommentAt: Date | string | null;
} | null | undefined): {
    myLastTouchAt: Date;
    lastExternalCommentAt: Date | null;
    isUnreadForMe: boolean;
};
type IssueBlockerAttentionNode = {
    id: string;
    companyId: string;
    parentId: string | null;
    identifier: string | null;
    title: string;
    status: string;
    executionRunId?: string | null;
    assigneeAgentId: string | null;
    assigneeUserId: string | null;
};
type IssueBlockerAttentionInputNode = Pick<IssueBlockerAttentionNode, "id" | "companyId" | "parentId" | "identifier" | "title" | "status" | "assigneeAgentId" | "assigneeUserId"> & {
    executionRunId?: string | null;
};
export declare function issueService(db: Db): {
    clearExecutionRunIfTerminal: (issueId: string) => Promise<boolean>;
    list: (companyId: string, filters?: IssueFilters) => Promise<IssueWithLabelsAndRun[]>;
    count: (companyId: string, filters?: IssueFilters) => Promise<number>;
    countUnreadTouchedByUser: (companyId: string, userId: string, status?: string) => Promise<number>;
    markRead: (companyId: string, issueId: string, userId: string, readAt?: Date) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        userId: string;
        issueId: string;
        lastReadAt: Date;
    }>;
    markUnread: (companyId: string, issueId: string, userId: string) => Promise<boolean>;
    archiveInbox: (companyId: string, issueId: string, userId: string, archivedAt?: Date) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        userId: string;
        issueId: string;
        archivedAt: Date;
    }>;
    unarchiveInbox: (companyId: string, issueId: string, userId: string) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        userId: string;
        issueId: string;
        archivedAt: Date;
    }>;
    getById: (raw: string) => Promise<IssueWithLabels | null>;
    getByIdentifier: (identifier: string) => Promise<IssueWithLabels | null>;
    getCurrentScheduledRetry: (issueId: string) => Promise<IssueScheduledRetryRow | null>;
    getRelationSummaries: (issueId: string) => Promise<IssueRelationSummaryMap>;
    getDependencyReadiness: (issueId: string, dbOrTx?: any) => Promise<IssueDependencyReadiness>;
    listDependencyReadiness: (companyId: string, issueIds: string[], dbOrTx?: any) => Promise<Map<string, IssueDependencyReadiness>>;
    listBlockerAttention: (companyId: string, issueRows: IssueBlockerAttentionInputNode[], dbOrTx?: any) => Promise<Map<string, IssueBlockerAttention>>;
    listProductivityReviews: (companyId: string, sourceIssueIds: string[], dbOrTx?: any) => Promise<Map<string, IssueProductivityReview>>;
    listWakeableBlockedDependents: (blockerIssueId: string) => Promise<{
        id: string;
        assigneeAgentId: string;
        blockerIssueIds: string[];
    }[]>;
    getWakeableParentAfterChildCompletion: (parentIssueId: string) => Promise<{
        id: string;
        assigneeAgentId: string;
        childIssueIds: string[];
        childIssueSummaries: ChildIssueCompletionSummary[];
        childIssueSummaryTruncated: boolean;
    } | null>;
    createChild: (parentIssueId: string, data: IssueChildCreateInput) => Promise<{
        issue: IssueWithLabels;
        parentBlockerAdded: boolean;
    }>;
    create: (companyId: string, data: IssueCreateInput) => Promise<IssueWithLabels>;
    update: (id: string, data: Partial<typeof issues.$inferInsert> & {
        labelIds?: string[];
        blockedByIssueIds?: string[];
        actorAgentId?: string | null;
        actorUserId?: string | null;
    }, dbOrTx?: any) => Promise<IssueWithLabels | null>;
    clearExecutionWorkspaceEnvironmentSelection: (companyId: string, environmentId: string) => Promise<number>;
    remove: (id: string) => Promise<IssueWithLabels | null>;
    checkout: (id: string, agentId: string, expectedStatuses: string[], checkoutRunId: string | null) => Promise<{
        id: string;
        companyId: string;
        projectId: string | null;
        projectWorkspaceId: string | null;
        goalId: string | null;
        parentId: string | null;
        title: string;
        description: string | null;
        status: string;
        workMode: string;
        priority: string;
        assigneeAgentId: string | null;
        assigneeUserId: string | null;
        checkoutRunId: string | null;
        executionRunId: string | null;
        executionAgentNameKey: string | null;
        executionLockedAt: Date | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        issueNumber: number | null;
        identifier: string | null;
        originKind: string;
        originId: string | null;
        originRunId: string | null;
        originFingerprint: string;
        requestDepth: number;
        billingCode: string | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        executionPolicy: Record<string, unknown> | null;
        executionState: Record<string, unknown> | null;
        monitorNextCheckAt: Date | null;
        monitorWakeRequestedAt: Date | null;
        monitorLastTriggeredAt: Date | null;
        monitorAttemptCount: number;
        monitorNotes: string | null;
        monitorScheduledBy: string | null;
        executionWorkspaceId: string | null;
        executionWorkspacePreference: string | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        startedAt: Date | null;
        completedAt: Date | null;
        cancelledAt: Date | null;
        hiddenAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    assertCheckoutOwner: (id: string, actorAgentId: string, actorRunId: string | null) => Promise<{
        adoptedFromRunId: string | null;
        id: string;
        status: string;
        assigneeAgentId: string | null;
        checkoutRunId: string | null;
        executionRunId: string | null;
    }>;
    release: (id: string, actorAgentId?: string, actorRunId?: string | null) => Promise<IssueWithLabels | null>;
    adminForceRelease: (id: string, options?: {
        clearAssignee?: boolean;
    }) => Promise<{
        issue: IssueWithLabels;
        previous: {
            checkoutRunId: string | null;
            executionRunId: string | null;
        };
    } | null>;
    listLabels: (companyId: string) => Omit<import("drizzle-orm/pg-core").PgSelectBase<"labels", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "labels";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        companyId: import("drizzle-orm/pg-core").PgColumn<{
            name: "company_id";
            tableName: "labels";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "labels";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        color: import("drizzle-orm/pg-core").PgColumn<{
            name: "color";
            tableName: "labels";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "labels";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "labels";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    }, "single", Record<"labels", "not-null">, false, "where" | "orderBy", {
        id: string;
        companyId: string;
        name: string;
        color: string;
        createdAt: Date;
        updatedAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "labels";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        companyId: import("drizzle-orm/pg-core").PgColumn<{
            name: "company_id";
            tableName: "labels";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "labels";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        color: import("drizzle-orm/pg-core").PgColumn<{
            name: "color";
            tableName: "labels";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "labels";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "labels";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    }>, "where" | "orderBy">;
    getLabelById: (id: string) => Promise<{
        id: string;
        companyId: string;
        name: string;
        color: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    createLabel: (companyId: string, data: Pick<typeof labels.$inferInsert, "name" | "color">) => Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        color: string;
    }>;
    deleteLabel: (id: string) => Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        color: string;
    }>;
    listComments: (issueId: string, opts?: {
        afterCommentId?: string | null;
        order?: "asc" | "desc";
        limit?: number | null;
    }) => Promise<({
        id: string;
        companyId: string;
        issueId: string;
        authorAgentId: string | null;
        authorUserId: string | null;
        authorType: "user" | "agent" | "system" | null;
        createdByRunId: string | null;
        body: string;
        presentation: IssueCommentPresentation | null;
        metadata: IssueCommentMetadata | null;
        createdAt: Date;
        updatedAt: Date;
    } & {
        authorType: IssueCommentAuthorType;
        presentation: IssueCommentPresentation | null;
        metadata: IssueCommentMetadata | null;
    })[]>;
    getCommentCursor: (issueId: string) => Promise<{
        totalComments: number;
        latestCommentId: string;
        latestCommentAt: Date;
    }>;
    getComment: (commentId: string) => Promise<({
        id: string;
        companyId: string;
        issueId: string;
        authorAgentId: string | null;
        authorUserId: string | null;
        authorType: "user" | "agent" | "system" | null;
        createdByRunId: string | null;
        body: string;
        presentation: IssueCommentPresentation | null;
        metadata: IssueCommentMetadata | null;
        createdAt: Date;
        updatedAt: Date;
    } & {
        authorType: IssueCommentAuthorType;
        presentation: IssueCommentPresentation | null;
        metadata: IssueCommentMetadata | null;
    }) | null>;
    removeComment: (commentId: string) => Promise<({
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        metadata: IssueCommentMetadata | null;
        issueId: string;
        body: string;
        authorType: "user" | "agent" | "system" | null;
        presentation: IssueCommentPresentation | null;
        authorUserId: string | null;
        createdByRunId: string | null;
        authorAgentId: string | null;
    } & {
        authorType: IssueCommentAuthorType;
        presentation: IssueCommentPresentation | null;
        metadata: IssueCommentMetadata | null;
    }) | null>;
    addComment: (issueId: string, body: string, actor: {
        agentId?: string;
        userId?: string;
        runId?: string | null;
    }, options?: {
        authorType?: IssueCommentAuthorType | null;
        presentation?: IssueCommentPresentation | null;
        metadata?: IssueCommentMetadata | null;
        createdAt?: Date | string | null;
    }) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        metadata: IssueCommentMetadata | null;
        issueId: string;
        body: string;
        authorType: "user" | "agent" | "system" | null;
        presentation: IssueCommentPresentation | null;
        authorUserId: string | null;
        createdByRunId: string | null;
        authorAgentId: string | null;
    } & {
        authorType: IssueCommentAuthorType;
        presentation: IssueCommentPresentation | null;
        metadata: IssueCommentMetadata | null;
    }>;
    createAttachment: (input: {
        issueId: string;
        issueCommentId?: string | null;
        provider: string;
        objectKey: string;
        contentType: string;
        byteSize: number;
        sha256: string;
        originalFilename?: string | null;
        createdByAgentId?: string | null;
        createdByUserId?: string | null;
    }) => Promise<{
        id: string;
        companyId: string;
        issueId: string;
        issueCommentId: string | null;
        assetId: string;
        provider: string;
        objectKey: string;
        contentType: string;
        byteSize: number;
        sha256: string;
        originalFilename: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    listAttachments: (issueId: string) => Promise<{
        id: string;
        companyId: string;
        issueId: string;
        issueCommentId: string | null;
        assetId: string;
        provider: string;
        objectKey: string;
        contentType: string;
        byteSize: number;
        sha256: string;
        originalFilename: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getAttachmentById: (id: string) => Promise<{
        id: string;
        companyId: string;
        issueId: string;
        issueCommentId: string | null;
        assetId: string;
        provider: string;
        objectKey: string;
        contentType: string;
        byteSize: number;
        sha256: string;
        originalFilename: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    removeAttachment: (id: string) => Promise<{
        id: string;
        companyId: string;
        issueId: string;
        issueCommentId: string | null;
        assetId: string;
        provider: string;
        objectKey: string;
        contentType: string;
        byteSize: number;
        sha256: string;
        originalFilename: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    findMentionedAgents: (companyId: string, body: string) => Promise<string[]>;
    findMentionedProjectIds: (issueId: string, opts?: {
        includeCommentBodies?: boolean;
    }) => Promise<string[]>;
    getAncestors: (issueId: string) => Promise<{
        project: {
            id: string;
            name: string;
            description: string | null;
            status: string;
            goalId: string | null;
            workspaces: Array<{
                id: string;
                companyId: string;
                projectId: string;
                name: string;
                cwd: string | null;
                repoUrl: string | null;
                repoRef: string | null;
                metadata: Record<string, unknown> | null;
                isPrimary: boolean;
                createdAt: Date;
                updatedAt: Date;
            }>;
            primaryWorkspace: {
                id: string;
                companyId: string;
                projectId: string;
                name: string;
                cwd: string | null;
                repoUrl: string | null;
                repoRef: string | null;
                metadata: Record<string, unknown> | null;
                isPrimary: boolean;
                createdAt: Date;
                updatedAt: Date;
            } | null;
        } | null;
        goal: {
            id: string;
            title: string;
            description: string | null;
            level: string;
            status: string;
        } | null;
        id: string;
        identifier: string | null;
        title: string;
        description: string | null;
        status: string;
        priority: string;
        assigneeAgentId: string | null;
        projectId: string | null;
        goalId: string | null;
    }[]>;
};
export {};
//# sourceMappingURL=issues.d.ts.map