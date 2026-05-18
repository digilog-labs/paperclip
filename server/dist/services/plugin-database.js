import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { pluginDatabaseNamespaces, pluginMigrations, plugins, } from "@paperclipai/db";
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_POSTGRES_IDENTIFIER_LENGTH = 63;
export function derivePluginDatabaseNamespace(pluginKey, namespaceSlug) {
    const hash = createHash("sha256").update(pluginKey).digest("hex").slice(0, 10);
    const slug = (namespaceSlug ?? pluginKey)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_")
        .slice(0, 36) || "plugin";
    const namespace = `plugin_${slug}_${hash}`;
    return namespace.slice(0, MAX_POSTGRES_IDENTIFIER_LENGTH);
}
function assertIdentifier(value, label = "identifier") {
    if (!IDENTIFIER_RE.test(value)) {
        throw new Error(`Unsafe SQL ${label}: ${value}`);
    }
    return value;
}
function quoteIdentifier(value) {
    return `"${assertIdentifier(value).replaceAll("\"", "\"\"")}"`;
}
function splitSqlStatements(input) {
    const statements = [];
    let start = 0;
    let quote = null;
    let lineComment = false;
    let blockComment = false;
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        const next = input[i + 1];
        if (lineComment) {
            if (char === "\n")
                lineComment = false;
            continue;
        }
        if (blockComment) {
            if (char === "*" && next === "/") {
                blockComment = false;
                i += 1;
            }
            continue;
        }
        if (quote) {
            if (char === quote) {
                if (next === quote) {
                    i += 1;
                }
                else {
                    quote = null;
                }
            }
            continue;
        }
        if (char === "-" && next === "-") {
            lineComment = true;
            i += 1;
            continue;
        }
        if (char === "/" && next === "*") {
            blockComment = true;
            i += 1;
            continue;
        }
        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }
        if (char === ";") {
            const statement = input.slice(start, i).trim();
            if (statement)
                statements.push(statement);
            start = i + 1;
        }
    }
    const trailing = input.slice(start).trim();
    if (trailing)
        statements.push(trailing);
    return statements;
}
function stripSqlForKeywordScan(input) {
    return input
        .replace(/'([^']|'')*'/g, "''")
        .replace(/"([^"]|"")*"/g, "\"\"")
        .replace(/--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
}
function normaliseSql(input) {
    return stripSqlForKeywordScan(input).replace(/\s+/g, " ").trim().toLowerCase();
}
function extractQualifiedRefs(statement) {
    const refs = [];
    const patterns = [
        {
            pattern: /\b(from|join|references|into|update)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\."?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
            groups: "keyword-schema-table",
        },
        {
            pattern: /\b(alter\s+table|create\s+table|create\s+view|drop\s+table|truncate\s+table)\s+(?:if\s+(?:not\s+)?exists\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?\."?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
            groups: "keyword-schema-table",
        },
        {
            pattern: /\bcreate\s+(?:unique\s+)?index(?:\s+concurrently)?\s+(?:if\s+not\s+exists\s+)?"?[A-Za-z_][A-Za-z0-9_]*"?\s+on\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\."?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
            groups: "schema-table",
            keyword: "create index",
        },
    ];
    for (const { pattern, ...mapping } of patterns) {
        for (const match of statement.matchAll(pattern)) {
            if (mapping.groups === "keyword-schema-table") {
                refs.push({ keyword: match[1].toLowerCase(), schema: match[2], table: match[3] });
            }
            else {
                refs.push({ keyword: mapping.keyword, schema: match[1], table: match[2] });
            }
        }
    }
    return refs;
}
function assertAllowedPublicRead(ref, allowedCoreReadTables) {
    if (ref.schema !== "public")
        return;
    if (!allowedCoreReadTables.has(ref.table)) {
        throw new Error(`Plugin SQL references public.${ref.table}, which is not whitelisted`);
    }
    if (!["from", "join", "references"].includes(ref.keyword)) {
        throw new Error(`Plugin SQL cannot mutate or define objects in public.${ref.table}`);
    }
}
function assertNoBannedSql(statement) {
    const normalized = normaliseSql(statement);
    const banned = [
        /\bcreate\s+extension\b/,
        /\bcreate\s+(?:event\s+)?trigger\b/,
        /\bcreate\s+(?:or\s+replace\s+)?function\b/,
        /\bcreate\s+language\b/,
        /\bgrant\b/,
        /\brevoke\b/,
        /\bsecurity\s+definer\b/,
        /\bcopy\b/,
        /\bcall\b/,
        /\bdo\s+(?:\$\$|language\b)/,
    ];
    const matched = banned.find((pattern) => pattern.test(normalized));
    if (matched) {
        throw new Error(`Plugin SQL contains a disallowed statement or clause: ${matched.source}`);
    }
}
export function validatePluginMigrationStatement(statement, namespace, coreReadTables = []) {
    assertIdentifier(namespace, "namespace");
    assertNoBannedSql(statement);
    const normalized = normaliseSql(statement);
    if (/^\s*(drop|truncate)\b/.test(normalized)) {
        throw new Error("Destructive plugin migrations are not allowed in Phase 1");
    }
    if (/\bdelete\s+from\b/.test(normalized)) {
        throw new Error("Plugin migrations cannot delete data");
    }
    const ddlOrBackfillAllowed = /^(create|alter|comment)\b/.test(normalized) ||
        /^(insert\s+into|update)\b/.test(normalized) ||
        (normalized.startsWith("with ") && /\b(insert\s+into|update)\b/.test(normalized));
    if (!ddlOrBackfillAllowed) {
        throw new Error("Plugin migrations may contain DDL or namespace-scoped backfill statements only");
    }
    const refs = extractQualifiedRefs(statement);
    if (refs.length === 0 && !normalized.startsWith("comment ")) {
        throw new Error("Plugin migration objects must use fully qualified schema names");
    }
    const objectRefKeywords = new Set([
        "alter table",
        "create index",
        "create table",
        "create view",
        "drop table",
        "into",
        "truncate table",
        "update",
    ]);
    const hasQualifiedObjectRef = refs.some((ref) => objectRefKeywords.has(ref.keyword));
    if (!hasQualifiedObjectRef && !normalized.startsWith("comment ")) {
        throw new Error("Plugin migration objects must use fully qualified schema names");
    }
    const allowedCoreReadTables = new Set(coreReadTables);
    for (const ref of refs) {
        if (ref.schema === namespace)
            continue;
        if (ref.schema === "public") {
            assertAllowedPublicRead(ref, allowedCoreReadTables);
            continue;
        }
        throw new Error(`Plugin SQL references schema "${ref.schema}" outside namespace "${namespace}"`);
    }
}
export function validatePluginRuntimeQuery(query, namespace, coreReadTables = []) {
    const statements = splitSqlStatements(query);
    if (statements.length !== 1) {
        throw new Error("Plugin runtime SQL must contain exactly one statement");
    }
    const statement = statements[0];
    assertNoBannedSql(statement);
    const normalized = normaliseSql(statement);
    if (!normalized.startsWith("select ") && !normalized.startsWith("with ")) {
        throw new Error("ctx.db.query only allows SELECT statements");
    }
    if (/\b(insert|update|delete|alter|create|drop|truncate)\b/.test(normalized)) {
        throw new Error("ctx.db.query cannot contain mutation or DDL keywords");
    }
    const allowedCoreReadTables = new Set(coreReadTables);
    for (const ref of extractQualifiedRefs(statement)) {
        if (ref.schema === namespace)
            continue;
        if (ref.schema === "public") {
            assertAllowedPublicRead(ref, allowedCoreReadTables);
            continue;
        }
        throw new Error(`ctx.db.query cannot read schema "${ref.schema}"`);
    }
}
export function validatePluginRuntimeExecute(query, namespace) {
    const statements = splitSqlStatements(query);
    if (statements.length !== 1) {
        throw new Error("Plugin runtime SQL must contain exactly one statement");
    }
    const statement = statements[0];
    assertNoBannedSql(statement);
    const normalized = normaliseSql(statement);
    if (!/^(insert\s+into|update|delete\s+from)\b/.test(normalized)) {
        throw new Error("ctx.db.execute only allows INSERT, UPDATE, or DELETE");
    }
    if (/\b(alter|create|drop|truncate)\b/.test(normalized)) {
        throw new Error("ctx.db.execute cannot contain DDL keywords");
    }
    const refs = extractQualifiedRefs(statement);
    const target = refs.find((ref) => ["into", "update", "from"].includes(ref.keyword));
    if (!target || target.schema !== namespace) {
        throw new Error(`ctx.db.execute target must be inside plugin namespace "${namespace}"`);
    }
    for (const ref of refs) {
        if (ref.schema !== namespace) {
            throw new Error("ctx.db.execute cannot reference public or other non-plugin schemas");
        }
    }
}
function bindSql(statement, params = []) {
    // Safe only after callers run the plugin SQL validators above.
    if (params.length === 0)
        return sql.raw(statement);
    const chunks = [];
    let cursor = 0;
    const placeholderPattern = /\$(\d+)/g;
    const seen = new Set();
    for (const match of statement.matchAll(placeholderPattern)) {
        const index = Number(match[1]);
        if (!Number.isInteger(index) || index < 1 || index > params.length) {
            throw new Error(`SQL placeholder $${match[1]} has no matching parameter`);
        }
        chunks.push(sql.raw(statement.slice(cursor, match.index)));
        chunks.push(sql `${params[index - 1]}`);
        seen.add(index);
        cursor = match.index + match[0].length;
    }
    chunks.push(sql.raw(statement.slice(cursor)));
    if (seen.size !== params.length) {
        throw new Error("Every ctx.db parameter must be referenced by a $n placeholder");
    }
    return sql.join(chunks, sql.raw(""));
}
async function listSqlMigrationFiles(migrationsDir) {
    const entries = await readdir(migrationsDir, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
}
function resolveMigrationsDir(packageRoot, migrationsDir) {
    const resolvedRoot = path.resolve(packageRoot);
    const resolvedDir = path.resolve(resolvedRoot, migrationsDir);
    const relative = path.relative(resolvedRoot, resolvedDir);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Plugin migrationsDir escapes package root: ${migrationsDir}`);
    }
    return resolvedDir;
}
export function pluginDatabaseService(db) {
    async function getPluginRecord(pluginId) {
        const rows = await db.select().from(plugins).where(eq(plugins.id, pluginId)).limit(1);
        const plugin = rows[0];
        if (!plugin)
            throw new Error(`Plugin not found: ${pluginId}`);
        return plugin;
    }
    async function ensureNamespaceWithClient(client, pluginId, manifest) {
        if (!manifest.database)
            return null;
        const namespaceName = derivePluginDatabaseNamespace(manifest.id, manifest.database.namespaceSlug);
        await client.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(namespaceName)}`));
        const rows = await client
            .insert(pluginDatabaseNamespaces)
            .values({
            pluginId,
            pluginKey: manifest.id,
            namespaceName,
            namespaceMode: "schema",
            status: "active",
        })
            .onConflictDoUpdate({
            target: pluginDatabaseNamespaces.pluginId,
            set: {
                pluginKey: manifest.id,
                namespaceName,
                namespaceMode: "schema",
                status: "active",
                updatedAt: new Date(),
            },
        })
            .returning();
        return rows[0] ?? null;
    }
    async function ensureNamespace(pluginId, manifest) {
        return ensureNamespaceWithClient(db, pluginId, manifest);
    }
    async function getNamespace(pluginId) {
        const rows = await db
            .select()
            .from(pluginDatabaseNamespaces)
            .where(eq(pluginDatabaseNamespaces.pluginId, pluginId))
            .limit(1);
        return rows[0] ?? null;
    }
    async function getRuntimeNamespace(pluginId) {
        const namespace = await getNamespace(pluginId);
        if (!namespace || namespace.status !== "active") {
            throw new Error("Plugin database namespace is not active");
        }
        return namespace.namespaceName;
    }
    async function recordMigrationFailure(client, input) {
        const message = input.error instanceof Error ? input.error.message : String(input.error);
        await client
            .insert(pluginMigrations)
            .values({
            pluginId: input.pluginId,
            pluginKey: input.pluginKey,
            namespaceName: input.namespaceName,
            migrationKey: input.migrationKey,
            checksum: input.checksum,
            pluginVersion: input.pluginVersion,
            status: "failed",
            errorMessage: message,
        })
            .onConflictDoUpdate({
            target: [pluginMigrations.pluginId, pluginMigrations.migrationKey],
            set: {
                checksum: input.checksum,
                pluginVersion: input.pluginVersion,
                status: "failed",
                errorMessage: message,
                startedAt: new Date(),
                appliedAt: null,
            },
        });
        await client
            .update(pluginDatabaseNamespaces)
            .set({ status: "migration_failed", updatedAt: new Date() })
            .where(eq(pluginDatabaseNamespaces.pluginId, input.pluginId));
    }
    return {
        ensureNamespace,
        async applyMigrations(pluginId, manifest, packageRoot, options = {}) {
            if (!manifest.database)
                return null;
            const namespace = await ensureNamespace(pluginId, manifest);
            if (!namespace)
                return null;
            const migrationDir = resolveMigrationsDir(packageRoot, manifest.database.migrationsDir);
            const migrationFiles = await listSqlMigrationFiles(migrationDir);
            const coreReadTables = manifest.database.coreReadTables ?? [];
            const lockKey = Number.parseInt(createHash("sha256").update(pluginId).digest("hex").slice(0, 12), 16);
            const persistFailure = options.persistFailure ?? true;
            const applyWithClient = async (client) => {
                await client.execute(sql `SELECT pg_advisory_xact_lock(${lockKey})`);
                for (const migrationKey of migrationFiles) {
                    const content = await readFile(path.join(migrationDir, migrationKey), "utf8");
                    const checksum = createHash("sha256").update(content).digest("hex");
                    const existingRows = await client
                        .select()
                        .from(pluginMigrations)
                        .where(and(eq(pluginMigrations.pluginId, pluginId), eq(pluginMigrations.migrationKey, migrationKey)))
                        .limit(1);
                    const existing = existingRows[0];
                    if (existing?.status === "applied") {
                        if (existing.checksum !== checksum) {
                            throw new Error(`Plugin migration checksum mismatch for ${migrationKey}`);
                        }
                        continue;
                    }
                    const statements = splitSqlStatements(content);
                    try {
                        if (statements.length === 0) {
                            throw new Error(`Plugin migration ${migrationKey} is empty`);
                        }
                        for (const statement of statements) {
                            validatePluginMigrationStatement(statement, namespace.namespaceName, coreReadTables);
                            await client.execute(sql.raw(statement));
                        }
                        await client
                            .insert(pluginMigrations)
                            .values({
                            pluginId,
                            pluginKey: manifest.id,
                            namespaceName: namespace.namespaceName,
                            migrationKey,
                            checksum,
                            pluginVersion: manifest.version,
                            status: "applied",
                            appliedAt: new Date(),
                        })
                            .onConflictDoUpdate({
                            target: [pluginMigrations.pluginId, pluginMigrations.migrationKey],
                            set: {
                                checksum,
                                pluginVersion: manifest.version,
                                status: "applied",
                                errorMessage: null,
                                startedAt: new Date(),
                                appliedAt: new Date(),
                            },
                        });
                    }
                    catch (error) {
                        if (persistFailure) {
                            await recordMigrationFailure(db, {
                                pluginId,
                                pluginKey: manifest.id,
                                namespaceName: namespace.namespaceName,
                                migrationKey,
                                checksum,
                                pluginVersion: manifest.version,
                                error,
                            });
                        }
                        throw error;
                    }
                }
            };
            if (typeof db.transaction === "function") {
                await db.transaction(async (tx) => applyWithClient(tx));
            }
            else {
                await applyWithClient(db);
            }
            return namespace;
        },
        getRuntimeNamespace,
        async query(pluginId, statement, params) {
            const plugin = await getPluginRecord(pluginId);
            const namespace = await getRuntimeNamespace(pluginId);
            validatePluginRuntimeQuery(statement, namespace, plugin.manifestJson.database?.coreReadTables ?? []);
            const result = await db.execute(bindSql(statement, params));
            return Array.from(result);
        },
        async execute(pluginId, statement, params) {
            const namespace = await getRuntimeNamespace(pluginId);
            validatePluginRuntimeExecute(statement, namespace);
            const result = await db.execute(bindSql(statement, params));
            return { rowCount: Number(result.count ?? 0) };
        },
    };
}
//# sourceMappingURL=plugin-database.js.map