import { and, desc, eq, inArray } from "drizzle-orm";
import { issueRecoveryActions } from "@paperclipai/db";
const ACTIVE_RECOVERY_ACTION_STATUSES = ["active", "escalated"];
const MAX_UPSERT_RETRIES = 3;
function toReadModel(row) {
    return {
        id: row.id,
        companyId: row.companyId,
        sourceIssueId: row.sourceIssueId,
        recoveryIssueId: row.recoveryIssueId,
        kind: row.kind,
        status: row.status,
        ownerType: row.ownerType,
        ownerAgentId: row.ownerAgentId,
        ownerUserId: row.ownerUserId,
        previousOwnerAgentId: row.previousOwnerAgentId,
        returnOwnerAgentId: row.returnOwnerAgentId,
        cause: row.cause,
        fingerprint: row.fingerprint,
        evidence: row.evidence,
        nextAction: row.nextAction,
        wakePolicy: row.wakePolicy,
        monitorPolicy: row.monitorPolicy,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        timeoutAt: row.timeoutAt,
        lastAttemptAt: row.lastAttemptAt,
        outcome: row.outcome,
        resolutionNote: row.resolutionNote,
        resolvedAt: row.resolvedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function isUniqueRecoveryActionConflict(error) {
    const maybe = error;
    return Boolean(maybe &&
        maybe.code === "23505" &&
        (maybe.constraint === "issue_recovery_actions_active_source_uq" ||
            maybe.constraint === "issue_recovery_actions_active_fingerprint_uq" ||
            typeof maybe.message === "string" && (maybe.message.includes("issue_recovery_actions_active_source_uq") ||
                maybe.message.includes("issue_recovery_actions_active_fingerprint_uq"))));
}
export function issueRecoveryActionService(db) {
    const upsertQueues = new Map();
    async function runExclusiveUpsert(input, task) {
        const key = `${input.companyId}:${input.sourceIssueId}`;
        const previous = upsertQueues.get(key) ?? Promise.resolve();
        let release = () => { };
        const current = new Promise((resolve) => {
            release = resolve;
        });
        const next = previous.catch(() => undefined).then(() => current);
        upsertQueues.set(key, next);
        await previous.catch(() => undefined);
        try {
            return await task();
        }
        finally {
            release();
            if (upsertQueues.get(key) === next) {
                upsertQueues.delete(key);
            }
        }
    }
    async function getActiveForIssue(companyId, sourceIssueId) {
        const row = await db
            .select()
            .from(issueRecoveryActions)
            .where(and(eq(issueRecoveryActions.companyId, companyId), eq(issueRecoveryActions.sourceIssueId, sourceIssueId), inArray(issueRecoveryActions.status, [...ACTIVE_RECOVERY_ACTION_STATUSES])))
            .orderBy(desc(issueRecoveryActions.updatedAt))
            .limit(1)
            .then((rows) => rows[0] ?? null);
        return row ? toReadModel(row) : null;
    }
    async function listActiveForIssues(companyId, sourceIssueIds) {
        if (sourceIssueIds.length === 0)
            return new Map();
        const rows = await db
            .select()
            .from(issueRecoveryActions)
            .where(and(eq(issueRecoveryActions.companyId, companyId), inArray(issueRecoveryActions.sourceIssueId, [...new Set(sourceIssueIds)]), inArray(issueRecoveryActions.status, [...ACTIVE_RECOVERY_ACTION_STATUSES])))
            .orderBy(desc(issueRecoveryActions.updatedAt));
        const result = new Map();
        for (const row of rows) {
            if (!result.has(row.sourceIssueId))
                result.set(row.sourceIssueId, toReadModel(row));
        }
        return result;
    }
    async function retryUpsertSourceScoped(input, retryCount, error) {
        if (retryCount >= MAX_UPSERT_RETRIES) {
            if (error)
                throw error;
            throw new Error(`Failed to upsert active recovery action for issue ${input.sourceIssueId} after ${MAX_UPSERT_RETRIES} retries`);
        }
        return upsertSourceScopedUnlocked(input, retryCount + 1);
    }
    async function upsertSourceScopedUnlocked(input, retryCount = 0) {
        const existing = await getActiveForIssue(input.companyId, input.sourceIssueId);
        const now = new Date();
        const ownerType = input.ownerType ?? (input.ownerAgentId ? "agent" : "board");
        if (existing) {
            const [updated] = await db
                .update(issueRecoveryActions)
                .set({
                recoveryIssueId: input.recoveryIssueId ?? null,
                kind: input.kind,
                status: "active",
                ownerType,
                ownerAgentId: input.ownerAgentId ?? null,
                ownerUserId: input.ownerUserId ?? null,
                previousOwnerAgentId: input.previousOwnerAgentId ?? existing.previousOwnerAgentId,
                returnOwnerAgentId: input.returnOwnerAgentId ?? existing.returnOwnerAgentId,
                cause: input.cause,
                fingerprint: input.fingerprint,
                evidence: input.evidence ?? existing.evidence,
                nextAction: input.nextAction,
                wakePolicy: input.wakePolicy ?? null,
                monitorPolicy: input.monitorPolicy ?? null,
                attemptCount: existing.attemptCount + 1,
                maxAttempts: input.maxAttempts ?? null,
                timeoutAt: input.timeoutAt ?? null,
                lastAttemptAt: input.lastAttemptAt ?? now,
                outcome: null,
                resolutionNote: null,
                resolvedAt: null,
                updatedAt: now,
            })
                .where(and(eq(issueRecoveryActions.id, existing.id), inArray(issueRecoveryActions.status, [...ACTIVE_RECOVERY_ACTION_STATUSES])))
                .returning();
            if (!updated) {
                return retryUpsertSourceScoped(input, retryCount);
            }
            return toReadModel(updated);
        }
        try {
            const [created] = await db
                .insert(issueRecoveryActions)
                .values({
                companyId: input.companyId,
                sourceIssueId: input.sourceIssueId,
                recoveryIssueId: input.recoveryIssueId ?? null,
                kind: input.kind,
                status: "active",
                ownerType,
                ownerAgentId: input.ownerAgentId ?? null,
                ownerUserId: input.ownerUserId ?? null,
                previousOwnerAgentId: input.previousOwnerAgentId ?? null,
                returnOwnerAgentId: input.returnOwnerAgentId ?? null,
                cause: input.cause,
                fingerprint: input.fingerprint,
                evidence: input.evidence ?? {},
                nextAction: input.nextAction,
                wakePolicy: input.wakePolicy ?? null,
                monitorPolicy: input.monitorPolicy ?? null,
                attemptCount: 1,
                maxAttempts: input.maxAttempts ?? null,
                timeoutAt: input.timeoutAt ?? null,
                lastAttemptAt: input.lastAttemptAt ?? now,
            })
                .returning();
            return toReadModel(created);
        }
        catch (error) {
            if (!isUniqueRecoveryActionConflict(error))
                throw error;
            return retryUpsertSourceScoped(input, retryCount, error);
        }
    }
    async function upsertSourceScoped(input) {
        return runExclusiveUpsert(input, () => upsertSourceScopedUnlocked(input));
    }
    async function resolveActiveForIssue(input, dbOrTx = db) {
        const now = new Date();
        const predicates = [
            eq(issueRecoveryActions.companyId, input.companyId),
            eq(issueRecoveryActions.sourceIssueId, input.sourceIssueId),
            inArray(issueRecoveryActions.status, [...ACTIVE_RECOVERY_ACTION_STATUSES]),
        ];
        if (input.actionId) {
            predicates.push(eq(issueRecoveryActions.id, input.actionId));
        }
        const [updated] = await dbOrTx
            .update(issueRecoveryActions)
            .set({
            status: input.status,
            outcome: input.outcome,
            resolutionNote: input.resolutionNote ?? null,
            resolvedAt: now,
            updatedAt: now,
        })
            .where(and(...predicates))
            .returning();
        return updated ? toReadModel(updated) : null;
    }
    return {
        getActiveForIssue,
        listActiveForIssues,
        resolveActiveForIssue,
        upsertSourceScoped,
    };
}
//# sourceMappingURL=issue-recovery-actions.js.map