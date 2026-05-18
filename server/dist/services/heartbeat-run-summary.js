export const HEARTBEAT_RUN_RESULT_SUMMARY_MAX_CHARS = 500;
export const HEARTBEAT_RUN_RESULT_OUTPUT_MAX_CHARS = 4_096;
export const HEARTBEAT_RUN_SAFE_RESULT_JSON_MAX_BYTES = 64 * 1024;
function truncateSummaryText(value, maxLength = HEARTBEAT_RUN_RESULT_SUMMARY_MAX_CHARS) {
    if (typeof value !== "string")
        return null;
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}
function readNumericField(record, key) {
    return key in record ? record[key] ?? null : undefined;
}
function readCommentText(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
export function mergeHeartbeatRunResultJson(resultJson, summary) {
    const normalizedSummary = readCommentText(summary);
    const baseResult = resultJson && typeof resultJson === "object" && !Array.isArray(resultJson)
        ? resultJson
        : null;
    if (!baseResult) {
        return normalizedSummary ? { summary: normalizedSummary } : null;
    }
    if (!normalizedSummary) {
        return baseResult;
    }
    if (readCommentText(baseResult.summary)) {
        return baseResult;
    }
    return {
        ...baseResult,
        summary: normalizedSummary,
    };
}
export function summarizeHeartbeatRunResultJson(resultJson) {
    if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
        return null;
    }
    const summary = {};
    const textFields = ["summary", "result", "message", "error"];
    for (const key of textFields) {
        const value = truncateSummaryText(resultJson[key]);
        if (value !== null) {
            summary[key] = value;
        }
    }
    const numericFieldAliases = ["total_cost_usd", "cost_usd", "costUsd"];
    for (const key of numericFieldAliases) {
        const value = readNumericField(resultJson, key);
        if (value !== undefined && value !== null) {
            summary[key] = value;
        }
    }
    for (const key of ["stopReason", "timeoutSource"]) {
        const value = readCommentText(resultJson[key]);
        if (value !== null) {
            summary[key] = value;
        }
    }
    for (const key of ["effectiveTimeoutSec", "effectiveTimeoutMs"]) {
        const value = readNumericField(resultJson, key);
        if (value !== undefined && value !== null) {
            summary[key] = value;
        }
    }
    for (const key of ["timeoutConfigured", "timeoutFired"]) {
        if (typeof resultJson[key] === "boolean") {
            summary[key] = resultJson[key];
        }
    }
    return Object.keys(summary).length > 0 ? summary : null;
}
export function buildHeartbeatRunIssueComment(resultJson) {
    if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
        return null;
    }
    return (readCommentText(resultJson.summary)
        ?? readCommentText(resultJson.result)
        ?? readCommentText(resultJson.message)
        ?? null);
}
//# sourceMappingURL=heartbeat-run-summary.js.map