type WakeupTriggerDetail = "manual" | "ping" | "callback" | "system";
type WakeupSource = "timer" | "assignment" | "on_demand" | "automation";
export interface IssueAssignmentWakeupDeps {
    wakeup: (agentId: string, opts: {
        source?: WakeupSource;
        triggerDetail?: WakeupTriggerDetail;
        reason?: string | null;
        payload?: Record<string, unknown> | null;
        requestedByActorType?: "user" | "agent" | "system";
        requestedByActorId?: string | null;
        contextSnapshot?: Record<string, unknown>;
    }) => Promise<unknown>;
}
export declare function queueIssueAssignmentWakeup(input: {
    heartbeat: IssueAssignmentWakeupDeps;
    issue: {
        id: string;
        assigneeAgentId: string | null;
        status: string;
    };
    reason: string;
    mutation: string;
    contextSource: string;
    requestedByActorType?: "user" | "agent" | "system";
    requestedByActorId?: string | null;
    rethrowOnError?: boolean;
}): Promise<unknown> | undefined;
export {};
//# sourceMappingURL=issue-assignment-wakeup.d.ts.map