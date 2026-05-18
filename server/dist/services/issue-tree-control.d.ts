import type { Db } from "@paperclipai/db";
import { issues } from "@paperclipai/db";
import { type IssueStatus, type IssueTreeControlMode, type IssueTreeControlPreview, type IssueTreeHold, type IssueTreeHoldReleasePolicy } from "@paperclipai/shared";
type IssueRow = typeof issues.$inferSelect;
export type ActiveIssueTreePauseHoldGate = {
    holdId: string;
    rootIssueId: string;
    issueId: string;
    isRoot: boolean;
    mode: "pause";
    reason: string | null;
    releasePolicy: IssueTreeHoldReleasePolicy | null;
};
type ActorInput = {
    actorType: "user" | "agent" | "system";
    actorId: string;
    agentId?: string | null;
    userId?: string | null;
    runId?: string | null;
};
type TreeIssue = IssueRow & {
    depth: number;
};
type TreeStatusUpdateResult = {
    updatedIssueIds: string[];
    updatedIssues: Array<{
        id: string;
        status: IssueStatus;
        assigneeAgentId: string | null;
    }>;
};
type RestoreTreeStatusResult = TreeStatusUpdateResult & {
    releasedCancelHoldIds: string[];
    restoreHold: IssueTreeHold | null;
};
export declare const ISSUE_TREE_CONTROL_INTERACTION_WAKE_REASONS: ReadonlySet<string>;
export declare function isVerifiedIssueTreeControlInteractionWake(dbOrTx: Pick<Db, "select">, input: {
    companyId: string;
    issueId: string;
    agentId?: string | null;
    contextSnapshot: Record<string, unknown> | null | undefined;
    requestedByActorType?: "user" | "agent" | "system" | string | null;
    requestedByActorId?: string | null;
    runId?: string | null;
    wakeupRequestId?: string | null;
}): Promise<boolean>;
export declare function issueTreeControlService(db: Db): {
    listTreeIssues: (companyId: string, rootIssueId: string) => Promise<TreeIssue[]>;
    preview: (companyId: string, rootIssueId: string, input: {
        mode: IssueTreeControlMode;
        releasePolicy?: IssueTreeHoldReleasePolicy | null;
    }) => Promise<IssueTreeControlPreview>;
    createHold: (companyId: string, rootIssueId: string, input: {
        mode: IssueTreeControlMode;
        reason?: string | null;
        releasePolicy?: IssueTreeHoldReleasePolicy | null;
        actor: ActorInput;
    }) => Promise<{
        hold: IssueTreeHold;
        preview: IssueTreeControlPreview;
        resumedPauseHoldIds?: string[];
    }>;
    cancelIssueStatusesForHold: (companyId: string, rootIssueId: string, holdId: string) => Promise<TreeStatusUpdateResult>;
    restoreIssueStatusesForHold: (companyId: string, rootIssueId: string, restoreHoldId: string, input: {
        reason?: string | null;
        actor: ActorInput;
    }) => Promise<RestoreTreeStatusResult>;
    getHold: (companyId: string, holdId: string) => Promise<IssueTreeHold | null>;
    listHolds: (companyId: string, rootIssueId: string, input?: {
        status?: IssueTreeHold["status"];
        mode?: IssueTreeControlMode;
        includeMembers?: boolean;
    }) => Promise<IssueTreeHold[]>;
    getActivePauseHoldGate: (companyId: string, issueId: string) => Promise<ActiveIssueTreePauseHoldGate | null>;
    releaseHold: (companyId: string, rootIssueId: string, holdId: string, input: {
        reason?: string | null;
        releasePolicy?: IssueTreeHoldReleasePolicy | null;
        metadata?: Record<string, unknown> | null;
        actor: ActorInput;
    }) => Promise<IssueTreeHold>;
    cancelUnclaimedWakeupsForTree: (companyId: string, rootIssueId: string, reason: string) => Promise<{
        id: string;
        agentId: string;
        reason: string | null;
        payload: Record<string, unknown> | null;
    }[]>;
};
export {};
//# sourceMappingURL=issue-tree-control.d.ts.map