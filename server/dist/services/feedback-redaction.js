import { createHash } from "node:crypto";
import { redactCurrentUserText } from "../log-redaction.js";
import { sanitizeRecord } from "../redaction.js";
const SECRET_ASSIGNMENT_RE = /\b(api[-_]?key|access[-_]?token|auth(?:_?token)?|authorization|bearer|secret|passwd|password|credential|jwt|private[-_]?key|cookie|connectionstring)\s*[:=]\s*([^\s,;]+)/gi;
const FREE_TEXT_PATTERNS = [
    {
        kind: "pem_block",
        regex: /-----BEGIN [^-]+-----[\s\S]+?-----END [^-]+-----/g,
        replacement: "[REDACTED_PEM_BLOCK]",
    },
    {
        kind: "secret_assignment",
        regex: SECRET_ASSIGNMENT_RE,
        replacement: (_match, key) => `${key}=[REDACTED]`,
    },
    {
        kind: "bearer_token",
        regex: /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
        replacement: "Bearer [REDACTED_TOKEN]",
    },
    {
        kind: "github_token",
        regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
        replacement: "[REDACTED_GITHUB_TOKEN]",
    },
    {
        kind: "provider_api_key",
        regex: /\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}\b/g,
        replacement: "[REDACTED_API_KEY]",
    },
    {
        kind: "jwt",
        regex: /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g,
        replacement: "[REDACTED_JWT]",
    },
    {
        kind: "dsn",
        regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|kafka|nats|mssql):\/\/[^\s<>'")]+/gi,
        replacement: "[REDACTED_CONNECTION_STRING]",
    },
    {
        kind: "email",
        regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        replacement: "[REDACTED_EMAIL]",
    },
    {
        kind: "phone",
        regex: /(?<!\w)(?:\+?\d[\d ()-]{7,}\d)(?!\w)/g,
        replacement: "[REDACTED_PHONE]",
    },
];
function isPlainRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function increment(state, kind, count) {
    if (count <= 0)
        return;
    state.counts.set(kind, (state.counts.get(kind) ?? 0) + count);
}
function recordField(state, fieldPath) {
    if (fieldPath.trim().length === 0)
        return;
    state.redactedFields.add(fieldPath);
}
function applyPattern(input, pattern) {
    const matches = Array.from(input.matchAll(pattern.regex)).length;
    if (matches === 0) {
        pattern.regex.lastIndex = 0;
        return { output: input, matches: 0 };
    }
    const output = input.replace(pattern.regex, pattern.replacement);
    pattern.regex.lastIndex = 0;
    return { output, matches };
}
export function createFeedbackRedactionState() {
    return {
        redactedFields: new Set(),
        truncatedFields: new Set(),
        omittedFields: new Set(),
        notes: new Set(),
        counts: new Map(),
    };
}
export function sanitizeFeedbackText(input, state, fieldPath, maxLength) {
    let output = redactCurrentUserText(input);
    if (output !== input) {
        recordField(state, fieldPath);
        increment(state, "current_user", 1);
    }
    for (const pattern of FREE_TEXT_PATTERNS) {
        const result = applyPattern(output, pattern);
        if (result.matches > 0) {
            output = result.output;
            recordField(state, fieldPath);
            increment(state, pattern.kind, result.matches);
        }
    }
    if (output.length > maxLength) {
        output = `${output.slice(0, Math.max(0, maxLength - 1))}...`;
        state.truncatedFields.add(fieldPath);
    }
    return output;
}
export function sanitizeFeedbackValue(value, state, fieldPath, maxStringLength) {
    if (typeof value === "string") {
        return sanitizeFeedbackText(value, state, fieldPath, maxStringLength);
    }
    if (Array.isArray(value)) {
        return value.map((entry, index) => sanitizeFeedbackValue(entry, state, `${fieldPath}[${index}]`, maxStringLength));
    }
    if (!isPlainRecord(value)) {
        return value;
    }
    const structurallySanitized = sanitizeRecord(value);
    if (stableStringify(structurallySanitized) !== stableStringify(value)) {
        recordField(state, fieldPath);
        increment(state, "structured_secret", 1);
    }
    const output = {};
    for (const [key, entry] of Object.entries(structurallySanitized)) {
        output[key] = sanitizeFeedbackValue(entry, state, `${fieldPath}.${key}`, maxStringLength);
    }
    return output;
}
export function finalizeFeedbackRedactionSummary(state) {
    return {
        strategy: "deterministic_feedback_v2",
        redactedFields: Array.from(state.redactedFields).sort(),
        truncatedFields: Array.from(state.truncatedFields).sort(),
        omittedFields: Array.from(state.omittedFields).sort(),
        notes: Array.from(state.notes).sort(),
        counts: Object.fromEntries(Array.from(state.counts.entries()).sort(([left], [right]) => left.localeCompare(right))),
    };
}
export function stableStringify(value) {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
    }
    const entries = Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
}
export function sha256Digest(value) {
    return createHash("sha256").update(stableStringify(value)).digest("hex");
}
//# sourceMappingURL=feedback-redaction.js.map