import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { documents, issueComments, issueDocuments, issueReferenceMentions, issues } from "@paperclipai/db";
import { extractIssueReferenceMatches } from "@paperclipai/shared";
import { notFound } from "../errors.js";
const SOURCE_KIND_ORDER = {
    title: 0,
    description: 1,
    document: 2,
    comment: 3,
};
function sourceLabel(kind, documentKey) {
    if (kind === "document")
        return documentKey?.trim() || "document";
    return kind;
}
function sourceWhere(input) {
    const conditions = [eq(issueReferenceMentions.sourceKind, input.sourceKind)];
    if (input.companyId)
        conditions.push(eq(issueReferenceMentions.companyId, input.companyId));
    if (input.sourceIssueId)
        conditions.push(eq(issueReferenceMentions.sourceIssueId, input.sourceIssueId));
    if (input.sourceRecordId) {
        conditions.push(eq(issueReferenceMentions.sourceRecordId, input.sourceRecordId));
    }
    else {
        conditions.push(isNull(issueReferenceMentions.sourceRecordId));
    }
    return and(...conditions);
}
function toIssueSummary(row) {
    return {
        id: row.relatedIssueId,
        identifier: row.relatedIssueIdentifier,
        title: row.relatedIssueTitle,
        status: row.relatedIssueStatus,
        priority: row.relatedIssuePriority,
        assigneeAgentId: row.relatedIssueAssigneeAgentId,
        assigneeUserId: row.relatedIssueAssigneeUserId,
    };
}
function sortSources(a, b) {
    const orderDelta = SOURCE_KIND_ORDER[a.kind] - SOURCE_KIND_ORDER[b.kind];
    if (orderDelta !== 0)
        return orderDelta;
    const labelDelta = a.label.localeCompare(b.label);
    if (labelDelta !== 0)
        return labelDelta;
    return (a.sourceRecordId ?? "").localeCompare(b.sourceRecordId ?? "");
}
function sortRelatedWork(a, b) {
    if (b.mentionCount !== a.mentionCount)
        return b.mentionCount - a.mentionCount;
    const leftLabel = a.issue.identifier ?? a.issue.title;
    const rightLabel = b.issue.identifier ?? b.issue.title;
    return leftLabel.localeCompare(rightLabel);
}
function emptySummary() {
    return {
        outbound: [],
        inbound: [],
    };
}
function diffIssueSummaries(before, after) {
    const beforeById = new Map(before.outbound.map((item) => [item.issue.id, item.issue]));
    const afterById = new Map(after.outbound.map((item) => [item.issue.id, item.issue]));
    return {
        addedReferencedIssues: after.outbound
            .map((item) => item.issue)
            .filter((issue) => !beforeById.has(issue.id)),
        removedReferencedIssues: before.outbound
            .map((item) => item.issue)
            .filter((issue) => !afterById.has(issue.id)),
        currentReferencedIssues: after.outbound.map((item) => item.issue),
    };
}
export function issueReferenceService(db) {
    async function replaceSourceMentions(input, dbOrTx = db) {
        const matches = extractIssueReferenceMatches(input.text ?? "");
        const identifiers = matches.map((match) => match.identifier);
        const resolvedTargets = identifiers.length > 0
            ? await dbOrTx
                .select({
                id: issues.id,
                identifier: issues.identifier,
            })
                .from(issues)
                .where(and(eq(issues.companyId, input.companyId), inArray(issues.identifier, identifiers)))
            : [];
        const targetByIdentifier = new Map(resolvedTargets
            .filter((row) => typeof row.identifier === "string")
            .map((row) => [row.identifier, row.id]));
        await dbOrTx.delete(issueReferenceMentions).where(sourceWhere(input));
        if (matches.length === 0)
            return;
        const seenTargetIds = new Set();
        const values = matches.flatMap((match) => {
            const targetIssueId = targetByIdentifier.get(match.identifier);
            if (!targetIssueId || targetIssueId === input.sourceIssueId || seenTargetIds.has(targetIssueId)) {
                return [];
            }
            seenTargetIds.add(targetIssueId);
            return [{
                    companyId: input.companyId,
                    sourceIssueId: input.sourceIssueId,
                    targetIssueId,
                    sourceKind: input.sourceKind,
                    sourceRecordId: input.sourceRecordId,
                    documentKey: input.documentKey,
                    matchedText: match.matchedText,
                }];
        });
        if (values.length > 0) {
            await dbOrTx.insert(issueReferenceMentions).values(values);
        }
    }
    async function issueById(issueId, dbOrTx = db) {
        return dbOrTx
            .select({
            id: issues.id,
            companyId: issues.companyId,
            title: issues.title,
            description: issues.description,
        })
            .from(issues)
            .where(eq(issues.id, issueId))
            .then((rows) => rows[0] ?? null);
    }
    async function syncIssue(issueId, dbOrTx = db) {
        const runSync = async (tx) => {
            const issue = await issueById(issueId, tx);
            if (!issue)
                throw notFound("Issue not found");
            await replaceSourceMentions({
                companyId: issue.companyId,
                sourceIssueId: issue.id,
                sourceKind: "title",
                sourceRecordId: null,
                documentKey: null,
                text: issue.title,
            }, tx);
            await replaceSourceMentions({
                companyId: issue.companyId,
                sourceIssueId: issue.id,
                sourceKind: "description",
                sourceRecordId: null,
                documentKey: null,
                text: issue.description,
            }, tx);
        };
        return dbOrTx === db ? db.transaction(runSync) : runSync(dbOrTx);
    }
    async function syncComment(commentId, dbOrTx = db) {
        const comment = await dbOrTx
            .select({
            id: issueComments.id,
            companyId: issueComments.companyId,
            issueId: issueComments.issueId,
            body: issueComments.body,
        })
            .from(issueComments)
            .where(eq(issueComments.id, commentId))
            .then((rows) => rows[0] ?? null);
        if (!comment)
            throw notFound("Issue comment not found");
        await replaceSourceMentions({
            companyId: comment.companyId,
            sourceIssueId: comment.issueId,
            sourceKind: "comment",
            sourceRecordId: comment.id,
            documentKey: null,
            text: comment.body,
        }, dbOrTx);
    }
    async function syncDocument(documentId, dbOrTx = db) {
        const document = await dbOrTx
            .select({
            documentId: documents.id,
            companyId: documents.companyId,
            issueId: issueDocuments.issueId,
            key: issueDocuments.key,
            body: documents.latestBody,
        })
            .from(issueDocuments)
            .innerJoin(documents, eq(issueDocuments.documentId, documents.id))
            .where(eq(documents.id, documentId))
            .then((rows) => rows[0] ?? null);
        if (!document) {
            await dbOrTx
                .delete(issueReferenceMentions)
                .where(and(eq(issueReferenceMentions.sourceKind, "document"), eq(issueReferenceMentions.sourceRecordId, documentId)));
            return;
        }
        await replaceSourceMentions({
            companyId: document.companyId,
            sourceIssueId: document.issueId,
            sourceKind: "document",
            sourceRecordId: document.documentId,
            documentKey: document.key,
            text: document.body,
        }, dbOrTx);
    }
    async function deleteDocumentSource(documentId, dbOrTx = db) {
        await dbOrTx
            .delete(issueReferenceMentions)
            .where(and(eq(issueReferenceMentions.sourceKind, "document"), eq(issueReferenceMentions.sourceRecordId, documentId)));
    }
    async function syncAllForIssue(issueId, dbOrTx = db) {
        const issue = await issueById(issueId, dbOrTx);
        if (!issue)
            throw notFound("Issue not found");
        await syncIssue(issueId, dbOrTx);
        const [comments, docs] = await Promise.all([
            dbOrTx
                .select({ id: issueComments.id })
                .from(issueComments)
                .where(eq(issueComments.issueId, issueId)),
            dbOrTx
                .select({ id: documents.id })
                .from(issueDocuments)
                .innerJoin(documents, eq(issueDocuments.documentId, documents.id))
                .where(eq(issueDocuments.issueId, issueId)),
        ]);
        for (const comment of comments) {
            await syncComment(comment.id, dbOrTx);
        }
        for (const doc of docs) {
            await syncDocument(doc.id, dbOrTx);
        }
    }
    async function syncAllForCompany(companyId, dbOrTx = db) {
        const issueRows = await dbOrTx
            .select({ id: issues.id })
            .from(issues)
            .where(eq(issues.companyId, companyId))
            .orderBy(asc(issues.createdAt), asc(issues.id));
        for (const issue of issueRows) {
            await syncAllForIssue(issue.id, dbOrTx);
        }
    }
    async function listIssueReferenceSummary(issueId, dbOrTx = db) {
        const issue = await issueById(issueId, dbOrTx);
        if (!issue)
            throw notFound("Issue not found");
        const [outboundRows, inboundRows] = await Promise.all([
            dbOrTx
                .select({
                relatedIssueId: issues.id,
                relatedIssueIdentifier: issues.identifier,
                relatedIssueTitle: issues.title,
                relatedIssueStatus: issues.status,
                relatedIssuePriority: issues.priority,
                relatedIssueAssigneeAgentId: issues.assigneeAgentId,
                relatedIssueAssigneeUserId: issues.assigneeUserId,
                sourceKind: issueReferenceMentions.sourceKind,
                sourceRecordId: issueReferenceMentions.sourceRecordId,
                documentKey: issueReferenceMentions.documentKey,
                matchedText: issueReferenceMentions.matchedText,
            })
                .from(issueReferenceMentions)
                .innerJoin(issues, eq(issueReferenceMentions.targetIssueId, issues.id))
                .where(and(eq(issueReferenceMentions.companyId, issue.companyId), eq(issueReferenceMentions.sourceIssueId, issueId))),
            dbOrTx
                .select({
                relatedIssueId: issues.id,
                relatedIssueIdentifier: issues.identifier,
                relatedIssueTitle: issues.title,
                relatedIssueStatus: issues.status,
                relatedIssuePriority: issues.priority,
                relatedIssueAssigneeAgentId: issues.assigneeAgentId,
                relatedIssueAssigneeUserId: issues.assigneeUserId,
                sourceKind: issueReferenceMentions.sourceKind,
                sourceRecordId: issueReferenceMentions.sourceRecordId,
                documentKey: issueReferenceMentions.documentKey,
                matchedText: issueReferenceMentions.matchedText,
            })
                .from(issueReferenceMentions)
                .innerJoin(issues, eq(issueReferenceMentions.sourceIssueId, issues.id))
                .where(and(eq(issueReferenceMentions.companyId, issue.companyId), eq(issueReferenceMentions.targetIssueId, issueId))),
        ]);
        const mapRows = (rows) => {
            const grouped = new Map();
            for (const row of rows) {
                const existing = grouped.get(row.relatedIssueId) ?? {
                    issue: toIssueSummary(row),
                    mentionCount: 0,
                    sources: [],
                };
                existing.mentionCount += 1;
                existing.sources.push({
                    kind: row.sourceKind,
                    sourceRecordId: row.sourceRecordId,
                    label: sourceLabel(row.sourceKind, row.documentKey),
                    matchedText: row.matchedText,
                });
                grouped.set(row.relatedIssueId, existing);
            }
            return [...grouped.values()]
                .map((item) => ({ ...item, sources: [...item.sources].sort(sortSources) }))
                .sort(sortRelatedWork);
        };
        return {
            outbound: mapRows(outboundRows),
            inbound: mapRows(inboundRows),
        };
    }
    return {
        syncIssue,
        syncComment,
        syncDocument,
        deleteDocumentSource,
        syncAllForIssue,
        syncAllForCompany,
        listIssueReferenceSummary,
        diffIssueReferenceSummary: diffIssueSummaries,
        emptySummary,
    };
}
//# sourceMappingURL=issue-references.js.map