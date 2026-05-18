import { spawn } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { executionWorkspaces, projectWorkspaces, workspaceRuntimeServices } from "@paperclipai/db";
import { listWorkspaceServiceCommandDefinitions, } from "@paperclipai/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { asNumber, asString, parseObject, renderTemplate } from "../adapters/utils.js";
import { resolveHomeAwarePath } from "../home-paths.js";
import { createLocalServiceKey, findLocalServiceRegistryRecordByRuntimeServiceId, findAdoptableLocalService, readLocalServicePortOwner, removeLocalServiceRegistryRecord, terminateLocalService, touchLocalServiceRegistryRecord, writeLocalServiceRegistryRecord, } from "./local-service-supervisor.js";
import { readExecutionWorkspaceConfig } from "./execution-workspaces.js";
import { readProjectWorkspaceRuntimeConfig } from "./project-workspace-runtime-config.js";
export function resolveShell() {
    const fallback = process.platform === "win32" ? "sh" : "/bin/sh";
    const shell = process.env.SHELL?.trim();
    if (!shell)
        return fallback;
    if (path.isAbsolute(shell) && !existsSync(shell))
        return fallback;
    return shell;
}
const runtimeServicesById = new Map();
const runtimeServicesByReuseKey = new Map();
const runtimeServiceLeasesByRun = new Map();
const DEFAULT_EXECUTE_PROCESS_OUTPUT_BYTES = 256 * 1024;
export async function resetRuntimeServicesForTests() {
    for (const record of runtimeServicesById.values()) {
        clearIdleTimer(record);
    }
    runtimeServicesById.clear();
    runtimeServicesByReuseKey.clear();
    runtimeServiceLeasesByRun.clear();
}
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const rec = value;
        return `{${Object.keys(rec).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(rec[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
function readJsonFile(filePath) {
    return JSON.parse(readFileSync(filePath, "utf8"));
}
function findWorkspaceRoot(startCwd) {
    let current = path.resolve(startCwd);
    while (true) {
        if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current)
            return null;
        current = parent;
    }
}
function isLinkedGitWorktreeCheckout(rootDir) {
    const gitMetadataPath = path.join(rootDir, ".git");
    if (!existsSync(gitMetadataPath))
        return false;
    const stat = lstatSync(gitMetadataPath);
    if (!stat.isFile())
        return false;
    return readFileSync(gitMetadataPath, "utf8").trimStart().startsWith("gitdir:");
}
function discoverWorkspacePackagePaths(rootDir) {
    const packagePaths = new Map();
    const ignoredDirNames = new Set([".git", ".paperclip", "dist", "node_modules"]);
    function visit(dirPath) {
        if (!existsSync(dirPath))
            return;
        const packageJsonPath = path.join(dirPath, "package.json");
        if (existsSync(packageJsonPath)) {
            const packageJson = readJsonFile(packageJsonPath);
            if (typeof packageJson.name === "string" && packageJson.name.length > 0) {
                packagePaths.set(packageJson.name, dirPath);
            }
        }
        for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            if (ignoredDirNames.has(entry.name))
                continue;
            visit(path.join(dirPath, entry.name));
        }
    }
    visit(path.join(rootDir, "packages"));
    visit(path.join(rootDir, "server"));
    visit(path.join(rootDir, "ui"));
    visit(path.join(rootDir, "cli"));
    return packagePaths;
}
function findServerWorkspaceLinkMismatches(rootDir) {
    const serverPackageJsonPath = path.join(rootDir, "server", "package.json");
    if (!existsSync(serverPackageJsonPath))
        return [];
    const serverPackageJson = readJsonFile(serverPackageJsonPath);
    const dependencies = {
        ...serverPackageJson.dependencies,
        ...serverPackageJson.devDependencies,
    };
    const workspacePackagePaths = discoverWorkspacePackagePaths(rootDir);
    const mismatches = [];
    for (const [packageName, version] of Object.entries(dependencies)) {
        if (typeof version !== "string" || !version.startsWith("workspace:"))
            continue;
        const expectedPath = workspacePackagePaths.get(packageName);
        if (!expectedPath)
            continue;
        const normalizedExpectedPath = existsSync(expectedPath) ? path.resolve(realpathSync(expectedPath)) : path.resolve(expectedPath);
        const linkPath = path.join(rootDir, "server", "node_modules", ...packageName.split("/"));
        const actualPath = existsSync(linkPath) ? path.resolve(realpathSync(linkPath)) : null;
        if (actualPath === normalizedExpectedPath)
            continue;
        mismatches.push({
            packageName,
            expectedPath: normalizedExpectedPath,
            actualPath,
        });
    }
    return mismatches;
}
export async function ensureServerWorkspaceLinksCurrent(startCwd, opts) {
    const workspaceRoot = findWorkspaceRoot(startCwd);
    if (!workspaceRoot)
        return;
    if (!isLinkedGitWorktreeCheckout(workspaceRoot))
        return;
    const mismatches = findServerWorkspaceLinkMismatches(workspaceRoot);
    if (mismatches.length === 0)
        return;
    if (opts?.onLog) {
        await opts.onLog("stdout", "[runtime] detected stale workspace package links for server; relinking dependencies...\n");
        for (const mismatch of mismatches) {
            await opts.onLog("stdout", `[runtime]   ${mismatch.packageName}: ${mismatch.actualPath ?? "missing"} -> ${mismatch.expectedPath}\n`);
        }
    }
    for (const mismatch of mismatches) {
        const linkPath = path.join(workspaceRoot, "server", "node_modules", ...mismatch.packageName.split("/"));
        await fs.mkdir(path.dirname(linkPath), { recursive: true });
        await fs.rm(linkPath, { recursive: true, force: true });
        await fs.symlink(mismatch.expectedPath, linkPath);
    }
    const remainingMismatches = findServerWorkspaceLinkMismatches(workspaceRoot);
    if (remainingMismatches.length === 0)
        return;
    throw new Error(`Workspace relink did not repair all server package links: ${remainingMismatches.map((item) => item.packageName).join(", ")}`);
}
export function sanitizeRuntimeServiceBaseEnv(baseEnv) {
    const env = { ...baseEnv };
    for (const key of Object.keys(env)) {
        if (key.startsWith("PAPERCLIP_")) {
            delete env[key];
        }
    }
    delete env.DATABASE_URL;
    delete env.npm_config_tailscale_auth;
    delete env.npm_config_authenticated_private;
    return env;
}
function stableRuntimeServiceId(input) {
    if (input.reportId)
        return input.reportId;
    const digest = createHash("sha256")
        .update(stableStringify({
        adapterType: input.adapterType,
        runId: input.runId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        serviceName: input.serviceName,
        providerRef: input.providerRef,
        reuseKey: input.reuseKey,
    }))
        .digest("hex")
        .slice(0, 32);
    return `${input.adapterType}-${digest}`;
}
function toRuntimeServiceRef(record, overrides) {
    return {
        id: record.id,
        companyId: record.companyId,
        projectId: record.projectId,
        projectWorkspaceId: record.projectWorkspaceId,
        executionWorkspaceId: record.executionWorkspaceId,
        issueId: record.issueId,
        serviceName: record.serviceName,
        status: record.status,
        lifecycle: record.lifecycle,
        scopeType: record.scopeType,
        scopeId: record.scopeId,
        reuseKey: record.reuseKey,
        command: record.command,
        cwd: record.cwd,
        port: record.port,
        url: record.url,
        provider: record.provider,
        providerRef: record.providerRef,
        ownerAgentId: record.ownerAgentId,
        startedByRunId: record.startedByRunId,
        lastUsedAt: record.lastUsedAt,
        startedAt: record.startedAt,
        stoppedAt: record.stoppedAt,
        stopPolicy: record.stopPolicy,
        healthStatus: record.healthStatus,
        reused: record.reused,
        ...overrides,
    };
}
function sanitizeSlugPart(value, fallback) {
    const raw = (value ?? "").trim().toLowerCase();
    const normalized = raw
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "");
    return normalized.length > 0 ? normalized : fallback;
}
function renderWorkspaceTemplate(template, input) {
    const issueIdentifier = input.issue?.identifier ?? input.issue?.id ?? "issue";
    const slug = sanitizeSlugPart(input.issue?.title, sanitizeSlugPart(issueIdentifier, "issue"));
    return renderTemplate(template, {
        issue: {
            id: input.issue?.id ?? "",
            identifier: input.issue?.identifier ?? "",
            title: input.issue?.title ?? "",
        },
        agent: {
            id: input.agent.id ?? "",
            name: input.agent.name,
        },
        project: {
            id: input.projectId ?? "",
        },
        workspace: {
            repoRef: input.repoRef ?? "",
        },
        slug,
    });
}
function sanitizeBranchName(value) {
    return value
        .trim()
        .replace(/[^A-Za-z0-9._/-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-/.]+|[-/.]+$/g, "")
        .slice(0, 120) || "paperclip-work";
}
function isAbsolutePath(value) {
    return path.isAbsolute(value) || value.startsWith("~");
}
function resolveConfiguredPath(value, baseDir) {
    if (isAbsolutePath(value)) {
        return resolveHomeAwarePath(value);
    }
    return path.resolve(baseDir, value);
}
function formatCommandForDisplay(command, args) {
    return [command, ...args]
        .map((part) => (/^[A-Za-z0-9_./:-]+$/.test(part) ? part : JSON.stringify(part)))
        .join(" ");
}
function trimToLastBytes(value, limit) {
    const byteLength = Buffer.byteLength(value, "utf8");
    if (byteLength <= limit)
        return value;
    return Buffer.from(value, "utf8").subarray(byteLength - limit).toString("utf8");
}
function createProcessOutputCapture(maxBytes) {
    const limit = Math.max(1, Math.trunc(maxBytes));
    let text = "";
    let truncated = false;
    let totalBytes = 0;
    return {
        append(chunk) {
            if (!chunk)
                return;
            totalBytes += Buffer.byteLength(chunk, "utf8");
            const combined = text + chunk;
            if (Buffer.byteLength(combined, "utf8") <= limit) {
                text = combined;
                return;
            }
            text = trimToLastBytes(combined, limit);
            truncated = true;
        },
        finish() {
            if (!truncated) {
                return {
                    text,
                    truncated: false,
                    totalBytes,
                };
            }
            return {
                text: `[output truncated to last ${limit} bytes; total ${totalBytes} bytes]\n${text}`,
                truncated: true,
                totalBytes,
            };
        },
    };
}
async function executeProcess(input) {
    const proc = await new Promise((resolve, reject) => {
        const child = spawn(input.command, input.args, {
            cwd: input.cwd,
            stdio: ["ignore", "pipe", "pipe"],
            env: input.env ?? process.env,
        });
        const stdout = createProcessOutputCapture(input.maxStdoutBytes ?? DEFAULT_EXECUTE_PROCESS_OUTPUT_BYTES);
        const stderr = createProcessOutputCapture(input.maxStderrBytes ?? DEFAULT_EXECUTE_PROCESS_OUTPUT_BYTES);
        child.stdout?.on("data", (chunk) => {
            stdout.append(String(chunk));
        });
        child.stderr?.on("data", (chunk) => {
            stderr.append(String(chunk));
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ stdout, stderr, code }));
    });
    const stdout = proc.stdout.finish();
    const stderr = proc.stderr.finish();
    return {
        stdout: stdout.text,
        stderr: stderr.text,
        code: proc.code,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        stdoutBytes: stdout.totalBytes,
        stderrBytes: stderr.totalBytes,
    };
}
async function runGit(args, cwd) {
    const proc = await executeProcess({
        command: "git",
        args,
        cwd,
    });
    if (proc.code !== 0) {
        throw new Error(proc.stderr.trim() || proc.stdout.trim() || `git ${args.join(" ")} failed`);
    }
    return proc.stdout.trim();
}
function gitErrorIncludes(error, needle) {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes(needle.toLowerCase());
}
function parseGitWorktreeListPorcelain(raw) {
    const entries = [];
    let current = {};
    for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("worktree ")) {
            current = { worktree: line.slice("worktree ".length) };
            continue;
        }
        if (line.startsWith("branch ")) {
            current.branch = line.slice("branch ".length);
            continue;
        }
        if (line === "" && current.worktree) {
            entries.push({
                worktree: current.worktree,
                branch: current.branch ?? null,
            });
            current = {};
        }
    }
    if (current.worktree) {
        entries.push({
            worktree: current.worktree,
            branch: current.branch ?? null,
        });
    }
    return entries;
}
async function resolveGitOwnerRepoRoot(cwd) {
    const checkoutRoot = path.resolve(await runGit(["rev-parse", "--show-toplevel"], cwd));
    const commonDir = await runGit(["rev-parse", "--git-common-dir"], checkoutRoot).catch(() => null);
    if (!commonDir)
        return checkoutRoot;
    return path.dirname(path.resolve(checkoutRoot, commonDir));
}
async function findRegisteredGitWorktreeByBranch(repoRoot, branchName) {
    const raw = await runGit(["worktree", "list", "--porcelain"], repoRoot).catch(() => null);
    if (!raw)
        return null;
    const expectedBranchRef = `refs/heads/${branchName}`;
    for (const entry of parseGitWorktreeListPorcelain(raw)) {
        if (entry.branch !== expectedBranchRef)
            continue;
        return path.resolve(entry.worktree);
    }
    return null;
}
async function isGitCheckout(cwd) {
    return Boolean(await runGit(["rev-parse", "--git-dir"], cwd).catch(() => null));
}
async function detectDefaultBranch(repoRoot) {
    // Try the explicit remote HEAD first (set by git clone or git remote set-head)
    try {
        const remoteHead = await runGit(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], repoRoot);
        const branch = remoteHead?.startsWith("origin/") ? remoteHead.slice("origin/".length) : remoteHead;
        if (branch)
            return branch;
    }
    catch {
        // Not set — fall through to heuristic
    }
    // Fallback: check for common default branch names on the remote
    for (const candidate of ["main", "master"]) {
        try {
            await runGit(["rev-parse", "--verify", `refs/remotes/origin/${candidate}`], repoRoot);
            return candidate;
        }
        catch {
            // Not found — try next
        }
    }
    return null;
}
async function directoryExists(value) {
    return fs.stat(value).then((stats) => stats.isDirectory()).catch(() => false);
}
async function listLinkedGitWorktreePaths(repoRoot) {
    const output = await runGit(["worktree", "list", "--porcelain"], repoRoot);
    const paths = new Set();
    for (const line of output.split("\n")) {
        if (!line.startsWith("worktree "))
            continue;
        const worktree = line.slice("worktree ".length).trim();
        if (!worktree)
            continue;
        paths.add(path.resolve(worktree));
    }
    return paths;
}
async function validateLinkedGitWorktree(input) {
    const resolvedWorktreePath = path.resolve(input.worktreePath);
    const listedWorktrees = await listLinkedGitWorktreePaths(input.repoRoot);
    if (!listedWorktrees.has(resolvedWorktreePath)) {
        return {
            valid: false,
            reason: "path is not registered in `git worktree list`",
        };
    }
    const worktreeTopLevel = await runGit(["rev-parse", "--show-toplevel"], resolvedWorktreePath).catch(() => null);
    if (!worktreeTopLevel || path.resolve(worktreeTopLevel) !== resolvedWorktreePath) {
        return {
            valid: false,
            reason: "git resolves this path to a different repository root",
        };
    }
    if (input.expectedBranchName) {
        const currentBranch = await runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], resolvedWorktreePath).catch(() => null);
        if (currentBranch !== input.expectedBranchName) {
            return {
                valid: false,
                reason: `worktree HEAD is on "${currentBranch ?? "<detached>"}" instead of "${input.expectedBranchName}"`,
            };
        }
    }
    return { valid: true };
}
function terminateChildProcess(child) {
    if (!child.pid)
        return;
    if (process.platform !== "win32") {
        try {
            process.kill(-child.pid, "SIGTERM");
            return;
        }
        catch {
            // Fall through to the direct child kill.
        }
    }
    if (!child.killed) {
        child.kill("SIGTERM");
    }
}
function buildWorkspaceCommandEnv(input) {
    const env = { ...process.env };
    env.PAPERCLIP_WORKSPACE_CWD = input.worktreePath;
    env.PAPERCLIP_WORKSPACE_PATH = input.worktreePath;
    env.PAPERCLIP_WORKSPACE_WORKTREE_PATH = input.worktreePath;
    env.PAPERCLIP_WORKSPACE_BRANCH = input.branchName;
    env.PAPERCLIP_WORKSPACE_BASE_CWD = input.base.baseCwd;
    env.PAPERCLIP_WORKSPACE_REPO_ROOT = input.repoRoot;
    env.PAPERCLIP_WORKSPACE_SOURCE = input.base.source;
    env.PAPERCLIP_WORKSPACE_REPO_REF = input.base.repoRef ?? "";
    env.PAPERCLIP_WORKSPACE_REPO_URL = input.base.repoUrl ?? "";
    env.PAPERCLIP_WORKSPACE_CREATED = input.created ? "true" : "false";
    env.PAPERCLIP_PROJECT_ID = input.base.projectId ?? "";
    env.PAPERCLIP_PROJECT_WORKSPACE_ID = input.base.workspaceId ?? "";
    env.PAPERCLIP_AGENT_ID = input.agent.id ?? "";
    env.PAPERCLIP_AGENT_NAME = input.agent.name;
    env.PAPERCLIP_COMPANY_ID = input.agent.companyId;
    env.PAPERCLIP_ISSUE_ID = input.issue?.id ?? "";
    env.PAPERCLIP_ISSUE_IDENTIFIER = input.issue?.identifier ?? "";
    env.PAPERCLIP_ISSUE_TITLE = input.issue?.title ?? "";
    env.PAPERCLIP_ISSUE_WORK_MODE = input.issue?.workMode ?? "";
    return env;
}
function quoteShellArg(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function resolveRepoManagedWorkspaceCommand(command, repoRoot) {
    const patterns = [
        /^(?<prefix>(?:bash|sh|zsh)\s+)(?<quote>["']?)(?<relative>\.\/[^"'\s]+)\k<quote>(?<suffix>(?:\s.*)?)$/s,
        /^(?<quote>["']?)(?<relative>\.\/[^"'\s]+)\k<quote>(?<suffix>(?:\s.*)?)$/s,
    ];
    for (const pattern of patterns) {
        const match = command.match(pattern);
        if (!match?.groups)
            continue;
        const relativePath = match.groups.relative;
        const repoManagedPath = path.join(repoRoot, relativePath.slice(2));
        if (!existsSync(repoManagedPath))
            continue;
        const prefix = match.groups.prefix ?? "";
        const suffix = match.groups.suffix ?? "";
        return `${prefix}${quoteShellArg(repoManagedPath)}${suffix}`;
    }
    return command;
}
async function runWorkspaceCommand(input) {
    const shell = resolveShell();
    const proc = await executeProcess({
        command: shell,
        args: ["-c", input.resolvedCommand ?? input.command],
        cwd: input.cwd,
        env: input.env,
    });
    if (proc.code === 0)
        return;
    const details = [proc.stderr.trim(), proc.stdout.trim()].filter(Boolean).join("\n");
    throw new Error(details.length > 0
        ? `${input.label} failed: ${details}`
        : `${input.label} failed with exit code ${proc.code ?? -1}`);
}
async function recordGitOperation(recorder, input) {
    if (!recorder) {
        return runGit(input.args, input.cwd);
    }
    let stdout = "";
    let stderr = "";
    let code = null;
    await recorder.recordOperation({
        phase: input.phase,
        command: formatCommandForDisplay("git", input.args),
        cwd: input.cwd,
        metadata: input.metadata ?? null,
        run: async () => {
            const result = await executeProcess({
                command: "git",
                args: input.args,
                cwd: input.cwd,
            });
            stdout = result.stdout;
            stderr = result.stderr;
            code = result.code;
            return {
                status: result.code === 0 ? "succeeded" : "failed",
                exitCode: result.code,
                stdout: result.stdout,
                stderr: result.stderr,
                system: result.code === 0 ? input.successMessage ?? null : null,
                metadata: result.stdoutTruncated || result.stderrTruncated
                    ? {
                        stdoutTruncated: result.stdoutTruncated,
                        stderrTruncated: result.stderrTruncated,
                        stdoutBytes: result.stdoutBytes,
                        stderrBytes: result.stderrBytes,
                    }
                    : null,
            };
        },
    });
    if (code !== 0) {
        const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
        throw new Error(details.length > 0
            ? `${input.failureLabel ?? `git ${input.args.join(" ")}`} failed: ${details}`
            : `${input.failureLabel ?? `git ${input.args.join(" ")}`} failed with exit code ${code ?? -1}`);
    }
    return stdout.trim();
}
async function recordWorkspaceCommandOperation(recorder, input) {
    if (!recorder) {
        await runWorkspaceCommand(input);
        return null;
    }
    let stdout = "";
    let stderr = "";
    let code = null;
    const operation = await recorder.recordOperation({
        phase: input.phase,
        command: input.command,
        cwd: input.cwd,
        metadata: input.metadata ?? null,
        run: async () => {
            const shell = resolveShell();
            const result = await executeProcess({
                command: shell,
                args: ["-c", input.resolvedCommand ?? input.command],
                cwd: input.cwd,
                env: input.env,
            });
            stdout = result.stdout;
            stderr = result.stderr;
            code = result.code;
            return {
                status: result.code === 0 ? "succeeded" : "failed",
                exitCode: result.code,
                stdout: result.stdout,
                stderr: result.stderr,
                system: result.code === 0 ? input.successMessage ?? null : null,
                metadata: result.stdoutTruncated || result.stderrTruncated
                    ? {
                        stdoutTruncated: result.stdoutTruncated,
                        stderrTruncated: result.stderrTruncated,
                        stdoutBytes: result.stdoutBytes,
                        stderrBytes: result.stderrBytes,
                    }
                    : null,
            };
        },
    });
    if (code === 0)
        return operation;
    const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
    throw new Error(details.length > 0
        ? `${input.label} failed: ${details}`
        : `${input.label} failed with exit code ${code ?? -1}`);
}
async function provisionExecutionWorktree(input) {
    const provisionCommand = asString(input.strategy.provisionCommand, "").trim();
    if (!provisionCommand)
        return;
    const resolvedProvisionCommand = resolveRepoManagedWorkspaceCommand(provisionCommand, input.repoRoot);
    await recordWorkspaceCommandOperation(input.recorder, {
        phase: "workspace_provision",
        command: provisionCommand,
        resolvedCommand: resolvedProvisionCommand,
        cwd: input.worktreePath,
        env: buildWorkspaceCommandEnv({
            base: input.base,
            repoRoot: input.repoRoot,
            worktreePath: input.worktreePath,
            branchName: input.branchName,
            issue: input.issue,
            agent: input.agent,
            created: input.created,
        }),
        label: `Execution workspace provision command "${provisionCommand}"`,
        metadata: {
            repoRoot: input.repoRoot,
            worktreePath: input.worktreePath,
            branchName: input.branchName,
            created: input.created,
            resolvedCommand: resolvedProvisionCommand === provisionCommand ? null : resolvedProvisionCommand,
        },
        successMessage: `Provisioned workspace at ${input.worktreePath}\n`,
    });
}
function buildExecutionWorkspaceCleanupEnv(input) {
    const env = sanitizeRuntimeServiceBaseEnv(process.env);
    env.PAPERCLIP_WORKSPACE_CWD = input.workspace.cwd ?? "";
    env.PAPERCLIP_WORKSPACE_PATH = input.workspace.cwd ?? "";
    env.PAPERCLIP_WORKSPACE_WORKTREE_PATH =
        input.workspace.providerRef ?? input.workspace.cwd ?? "";
    env.PAPERCLIP_WORKSPACE_BRANCH = input.workspace.branchName ?? "";
    env.PAPERCLIP_WORKSPACE_BASE_CWD = input.projectWorkspaceCwd ?? "";
    env.PAPERCLIP_WORKSPACE_REPO_ROOT = input.projectWorkspaceCwd ?? "";
    env.PAPERCLIP_WORKSPACE_REPO_URL = input.workspace.repoUrl ?? "";
    env.PAPERCLIP_WORKSPACE_REPO_REF = input.workspace.baseRef ?? "";
    env.PAPERCLIP_PROJECT_ID = input.workspace.projectId ?? "";
    env.PAPERCLIP_PROJECT_WORKSPACE_ID = input.workspace.projectWorkspaceId ?? "";
    env.PAPERCLIP_ISSUE_ID = input.workspace.sourceIssueId ?? "";
    return env;
}
async function resolveGitRepoRootForWorkspaceCleanup(worktreePath, projectWorkspaceCwd) {
    if (projectWorkspaceCwd) {
        const resolvedProjectWorkspaceCwd = path.resolve(projectWorkspaceCwd);
        const gitDir = await runGit(["rev-parse", "--git-common-dir"], resolvedProjectWorkspaceCwd)
            .catch(() => null);
        if (gitDir) {
            const resolvedGitDir = path.resolve(resolvedProjectWorkspaceCwd, gitDir);
            return path.dirname(resolvedGitDir);
        }
    }
    const gitDir = await runGit(["rev-parse", "--git-common-dir"], worktreePath).catch(() => null);
    if (!gitDir)
        return null;
    const resolvedGitDir = path.resolve(worktreePath, gitDir);
    return path.dirname(resolvedGitDir);
}
export async function realizeExecutionWorkspace(input) {
    const rawStrategy = parseObject(input.config.workspaceStrategy);
    const strategyType = asString(rawStrategy.type, "project_primary");
    if (strategyType !== "git_worktree") {
        return {
            ...input.base,
            strategy: "project_primary",
            cwd: input.base.baseCwd,
            branchName: null,
            worktreePath: null,
            warnings: [],
            created: false,
        };
    }
    const repoRoot = await resolveGitOwnerRepoRoot(input.base.baseCwd);
    const branchTemplate = asString(rawStrategy.branchTemplate, "{{issue.identifier}}-{{slug}}");
    const renderedBranch = renderWorkspaceTemplate(branchTemplate, {
        issue: input.issue,
        agent: input.agent,
        projectId: input.base.projectId,
        repoRef: input.base.repoRef,
    });
    const branchName = sanitizeBranchName(renderedBranch);
    const configuredParentDir = asString(rawStrategy.worktreeParentDir, "");
    const worktreeParentDir = configuredParentDir
        ? resolveConfiguredPath(configuredParentDir, repoRoot)
        : path.join(repoRoot, ".paperclip", "worktrees");
    const worktreePath = path.join(worktreeParentDir, branchName);
    const configuredBaseRef = typeof rawStrategy.baseRef === "string" && rawStrategy.baseRef.length > 0
        ? rawStrategy.baseRef
        : input.base.repoRef ?? null;
    const baseRef = configuredBaseRef
        ?? await detectDefaultBranch(repoRoot)
        ?? "HEAD";
    await fs.mkdir(worktreeParentDir, { recursive: true });
    async function reuseExistingWorktree(reusablePath) {
        if (input.recorder) {
            await input.recorder.recordOperation({
                phase: "worktree_prepare",
                cwd: repoRoot,
                metadata: {
                    repoRoot,
                    worktreePath: reusablePath,
                    branchName,
                    baseRef,
                    created: false,
                    reused: true,
                },
                run: async () => ({
                    status: "succeeded",
                    exitCode: 0,
                    system: `Reused existing git worktree at ${reusablePath}\n`,
                }),
            });
        }
        await provisionExecutionWorktree({
            strategy: rawStrategy,
            base: input.base,
            repoRoot,
            worktreePath: reusablePath,
            branchName,
            issue: input.issue,
            agent: input.agent,
            created: false,
            recorder: input.recorder ?? null,
        });
        return {
            ...input.base,
            strategy: "git_worktree",
            cwd: reusablePath,
            branchName,
            worktreePath: reusablePath,
            warnings: [],
            created: false,
        };
    }
    async function validateReusableWorktree(reusablePath) {
        return await validateLinkedGitWorktree({
            repoRoot,
            worktreePath: reusablePath,
            expectedBranchName: branchName,
        }).catch(() => null);
    }
    const existingWorktree = await directoryExists(worktreePath);
    if (existingWorktree) {
        const validation = await validateReusableWorktree(worktreePath);
        if (validation?.valid) {
            return await reuseExistingWorktree(worktreePath);
        }
        const reason = validation && !validation.valid ? ` (${validation.reason})` : "";
        throw new Error(`Configured worktree path "${worktreePath}" already exists and is not a reusable git worktree${reason}.`);
    }
    const registeredBranchWorktree = await findRegisteredGitWorktreeByBranch(repoRoot, branchName);
    if (registeredBranchWorktree) {
        const validation = await validateReusableWorktree(registeredBranchWorktree);
        if (validation?.valid) {
            return await reuseExistingWorktree(registeredBranchWorktree);
        }
        const reason = validation && !validation.valid ? ` (${validation.reason})` : "";
        throw new Error(`Registered worktree for branch "${branchName}" at "${registeredBranchWorktree}" is not reusable${reason}.`);
    }
    try {
        await recordGitOperation(input.recorder, {
            phase: "worktree_prepare",
            args: ["worktree", "add", "-b", branchName, worktreePath, baseRef],
            cwd: repoRoot,
            metadata: {
                repoRoot,
                worktreePath,
                branchName,
                baseRef,
                created: true,
            },
            successMessage: `Created git worktree at ${worktreePath}\n`,
            failureLabel: `git worktree add ${worktreePath}`,
        });
    }
    catch (error) {
        if (!gitErrorIncludes(error, "already exists")) {
            throw error;
        }
        try {
            await recordGitOperation(input.recorder, {
                phase: "worktree_prepare",
                args: ["worktree", "add", worktreePath, branchName],
                cwd: repoRoot,
                metadata: {
                    repoRoot,
                    worktreePath,
                    branchName,
                    baseRef,
                    created: false,
                    reusedExistingBranch: true,
                },
                successMessage: `Attached existing branch ${branchName} at ${worktreePath}\n`,
                failureLabel: `git worktree add ${worktreePath}`,
            });
        }
        catch (attachError) {
            if (!gitErrorIncludes(attachError, "already checked out")) {
                throw attachError;
            }
            const reusablePath = await findRegisteredGitWorktreeByBranch(repoRoot, branchName);
            if (!reusablePath || !await isGitCheckout(reusablePath)) {
                throw attachError;
            }
            return await reuseExistingWorktree(reusablePath);
        }
    }
    await provisionExecutionWorktree({
        strategy: rawStrategy,
        base: input.base,
        repoRoot,
        worktreePath,
        branchName,
        issue: input.issue,
        agent: input.agent,
        created: true,
        recorder: input.recorder ?? null,
    });
    return {
        ...input.base,
        strategy: "git_worktree",
        cwd: worktreePath,
        branchName,
        worktreePath,
        warnings: [],
        created: true,
    };
}
export async function ensurePersistedExecutionWorkspaceAvailable(input) {
    const cwd = asString(input.workspace.cwd ?? input.workspace.providerRef, "").trim();
    if (!cwd)
        return null;
    const strategy = input.workspace.strategyType === "git_worktree" ? "git_worktree" : "project_primary";
    const realized = {
        baseCwd: input.base.baseCwd,
        source: input.workspace.mode === "shared_workspace" ? "project_primary" : "task_session",
        projectId: input.workspace.projectId ?? input.base.projectId,
        workspaceId: input.workspace.projectWorkspaceId ?? input.base.workspaceId,
        repoUrl: input.workspace.repoUrl ?? input.base.repoUrl,
        repoRef: input.workspace.baseRef ?? input.base.repoRef,
        strategy,
        cwd,
        branchName: input.workspace.branchName ?? null,
        worktreePath: strategy === "git_worktree" ? (input.workspace.providerRef ?? cwd) : null,
        warnings: [],
        created: false,
    };
    const provisionCommand = asString(input.workspace.config?.provisionCommand, "").trim();
    if (strategy !== "git_worktree") {
        return realized;
    }
    if (await directoryExists(cwd)) {
        if (provisionCommand) {
            const repoRoot = await runGit(["rev-parse", "--show-toplevel"], input.base.baseCwd);
            await provisionExecutionWorktree({
                strategy: {
                    type: "git_worktree",
                    provisionCommand,
                },
                base: input.base,
                repoRoot,
                worktreePath: realized.worktreePath ?? cwd,
                branchName: realized.branchName ?? "",
                issue: input.issue,
                agent: input.agent,
                created: false,
                recorder: input.recorder ?? null,
            });
        }
        return realized;
    }
    const repoRoot = await runGit(["rev-parse", "--show-toplevel"], input.base.baseCwd);
    const worktreePath = realized.worktreePath ?? cwd;
    const branchName = asString(input.workspace.branchName, "").trim();
    if (!branchName) {
        throw new Error(`Execution workspace "${cwd}" is missing and cannot be restored because no branch name is recorded.`);
    }
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });
    await runGit(["worktree", "prune"], repoRoot).catch(() => { });
    let created = false;
    try {
        await recordGitOperation(input.recorder, {
            phase: "worktree_prepare",
            args: ["worktree", "add", worktreePath, branchName],
            cwd: repoRoot,
            metadata: {
                repoRoot,
                worktreePath,
                branchName,
                baseRef: input.workspace.baseRef ?? input.base.repoRef ?? null,
                created: false,
                restored: true,
            },
            successMessage: `Reattached missing git worktree at ${worktreePath}\n`,
            failureLabel: `git worktree add ${worktreePath}`,
        });
    }
    catch (error) {
        if (!gitErrorIncludes(error, "invalid reference")
            && !gitErrorIncludes(error, "not a commit")
            && !gitErrorIncludes(error, "unknown revision")) {
            throw error;
        }
        const baseRef = input.workspace.baseRef ?? await detectDefaultBranch(repoRoot) ?? "HEAD";
        await recordGitOperation(input.recorder, {
            phase: "worktree_prepare",
            args: ["worktree", "add", "-b", branchName, worktreePath, baseRef],
            cwd: repoRoot,
            metadata: {
                repoRoot,
                worktreePath,
                branchName,
                baseRef,
                created: true,
                restored: true,
            },
            successMessage: `Recreated missing git worktree at ${worktreePath}\n`,
            failureLabel: `git worktree add ${worktreePath}`,
        });
        created = true;
    }
    await provisionExecutionWorktree({
        strategy: {
            type: "git_worktree",
            ...(provisionCommand ? { provisionCommand } : {}),
        },
        base: input.base,
        repoRoot,
        worktreePath,
        branchName,
        issue: input.issue,
        agent: input.agent,
        created,
        recorder: input.recorder ?? null,
    });
    return {
        ...realized,
        cwd: worktreePath,
        worktreePath,
        created,
    };
}
export async function cleanupExecutionWorkspaceArtifacts(input) {
    const warnings = [];
    const workspacePath = input.workspace.providerRef ?? input.workspace.cwd;
    const repoRoot = input.workspace.providerType === "git_worktree" && workspacePath
        ? await resolveGitRepoRootForWorkspaceCleanup(workspacePath, input.projectWorkspace?.cwd ?? null)
        : null;
    const cleanupEnv = buildExecutionWorkspaceCleanupEnv({
        workspace: input.workspace,
        projectWorkspaceCwd: input.projectWorkspace?.cwd ?? null,
    });
    const createdByRuntime = input.workspace.metadata?.createdByRuntime === true;
    const cleanupCommands = [
        input.cleanupCommand ?? null,
        input.projectWorkspace?.cleanupCommand ?? null,
        input.teardownCommand ?? null,
    ]
        .map((value) => asString(value, "").trim())
        .filter(Boolean);
    for (const command of cleanupCommands) {
        try {
            const resolvedCommand = repoRoot
                ? resolveRepoManagedWorkspaceCommand(command, repoRoot)
                : command;
            await recordWorkspaceCommandOperation(input.recorder, {
                phase: "workspace_teardown",
                command,
                resolvedCommand,
                cwd: workspacePath ?? input.projectWorkspace?.cwd ?? process.cwd(),
                env: cleanupEnv,
                label: `Execution workspace cleanup command "${command}"`,
                metadata: {
                    workspaceId: input.workspace.id,
                    workspacePath,
                    branchName: input.workspace.branchName,
                    providerType: input.workspace.providerType,
                    resolvedCommand: resolvedCommand === command ? null : resolvedCommand,
                },
                successMessage: `Completed cleanup command "${command}"\n`,
            });
        }
        catch (err) {
            warnings.push(err instanceof Error ? err.message : String(err));
        }
    }
    if (input.workspace.providerType === "git_worktree" && workspacePath) {
        const worktreeExists = await directoryExists(workspacePath);
        if (worktreeExists) {
            if (!repoRoot) {
                warnings.push(`Could not resolve git repo root for "${workspacePath}".`);
            }
            else {
                try {
                    await recordGitOperation(input.recorder, {
                        phase: "worktree_cleanup",
                        args: ["worktree", "remove", "--force", workspacePath],
                        cwd: repoRoot,
                        metadata: {
                            workspaceId: input.workspace.id,
                            workspacePath,
                            branchName: input.workspace.branchName,
                            cleanupAction: "worktree_remove",
                        },
                        successMessage: `Removed git worktree ${workspacePath}\n`,
                        failureLabel: `git worktree remove ${workspacePath}`,
                    });
                }
                catch (err) {
                    warnings.push(err instanceof Error ? err.message : String(err));
                }
            }
        }
        if (createdByRuntime && input.workspace.branchName) {
            if (!repoRoot) {
                warnings.push(`Could not resolve git repo root to delete branch "${input.workspace.branchName}".`);
            }
            else {
                try {
                    await recordGitOperation(input.recorder, {
                        phase: "worktree_cleanup",
                        args: ["branch", "-d", input.workspace.branchName],
                        cwd: repoRoot,
                        metadata: {
                            workspaceId: input.workspace.id,
                            workspacePath,
                            branchName: input.workspace.branchName,
                            cleanupAction: "branch_delete",
                        },
                        successMessage: `Deleted branch ${input.workspace.branchName}\n`,
                        failureLabel: `git branch -d ${input.workspace.branchName}`,
                    });
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    warnings.push(`Skipped deleting branch "${input.workspace.branchName}": ${message}`);
                }
            }
        }
    }
    else if (input.workspace.providerType === "local_fs" && createdByRuntime && workspacePath) {
        const projectWorkspaceCwd = input.projectWorkspace?.cwd ? path.resolve(input.projectWorkspace.cwd) : null;
        const resolvedWorkspacePath = path.resolve(workspacePath);
        const containsProjectWorkspace = projectWorkspaceCwd
            ? (resolvedWorkspacePath === projectWorkspaceCwd ||
                projectWorkspaceCwd.startsWith(`${resolvedWorkspacePath}${path.sep}`))
            : false;
        if (containsProjectWorkspace) {
            warnings.push(`Refusing to remove path "${workspacePath}" because it contains the project workspace.`);
        }
        else {
            await fs.rm(resolvedWorkspacePath, { recursive: true, force: true });
            if (input.recorder) {
                await input.recorder.recordOperation({
                    phase: "workspace_teardown",
                    cwd: projectWorkspaceCwd ?? process.cwd(),
                    metadata: {
                        workspaceId: input.workspace.id,
                        workspacePath: resolvedWorkspacePath,
                        cleanupAction: "remove_local_fs",
                    },
                    run: async () => ({
                        status: "succeeded",
                        exitCode: 0,
                        system: `Removed local workspace directory ${resolvedWorkspacePath}\n`,
                    }),
                });
            }
        }
    }
    const cleaned = !workspacePath ||
        !(await directoryExists(workspacePath));
    return {
        cleanedPath: workspacePath,
        cleaned,
        warnings,
    };
}
async function allocatePort() {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            server.close((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!address || typeof address === "string") {
                    reject(new Error("Failed to allocate port"));
                    return;
                }
                resolve(address.port);
            });
        });
        server.on("error", reject);
    });
}
function buildTemplateData(input) {
    return {
        workspace: {
            cwd: input.workspace.cwd,
            branchName: input.workspace.branchName ?? "",
            worktreePath: input.workspace.worktreePath ?? "",
            repoUrl: input.workspace.repoUrl ?? "",
            repoRef: input.workspace.repoRef ?? "",
            env: input.adapterEnv,
        },
        issue: {
            id: input.issue?.id ?? "",
            identifier: input.issue?.identifier ?? "",
            title: input.issue?.title ?? "",
        },
        agent: {
            id: input.agent.id ?? "",
            name: input.agent.name,
        },
        port: input.port ?? "",
    };
}
function renderRuntimeServiceEnv(input) {
    const rendered = {};
    for (const [key, value] of Object.entries(input.envConfig)) {
        if (typeof value !== "string")
            continue;
        rendered[key] = renderTemplate(value, input.templateData);
    }
    return rendered;
}
function resolveRuntimeServiceReuseIdentity(input) {
    const serviceName = asString(input.service.name, "service");
    const lifecycle = asString(input.service.lifecycle, "shared") === "ephemeral" ? "ephemeral" : "shared";
    const command = asString(input.service.command, "");
    const serviceCwdTemplate = asString(input.service.cwd, ".");
    const portConfig = parseObject(input.service.port);
    const envConfig = parseObject(input.service.env);
    const explicitPort = asNumber(portConfig.value, asNumber(input.service.port, 0));
    const identityPort = explicitPort > 0 ? explicitPort : null;
    const templateData = buildTemplateData({
        workspace: input.workspace,
        agent: input.agent,
        issue: input.issue,
        adapterEnv: input.adapterEnv,
        port: identityPort,
    });
    const serviceCwd = resolveConfiguredPath(renderTemplate(serviceCwdTemplate, templateData), input.workspace.cwd);
    const renderedEnv = renderRuntimeServiceEnv({
        envConfig,
        templateData,
    });
    const envFingerprint = createHash("sha256").update(stableStringify(renderedEnv)).digest("hex");
    const reuseKey = lifecycle === "shared"
        ? createHash("sha256")
            .update(stableStringify({
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            serviceName,
            command,
            cwd: serviceCwd,
            port: identityPort,
            env: renderedEnv,
        }))
            .digest("hex")
        : null;
    return {
        serviceName,
        lifecycle,
        command,
        serviceCwd,
        envConfig,
        envFingerprint,
        explicitPort,
        identityPort,
        reuseKey,
    };
}
function resolveWorkspaceCommandExecution(input) {
    const name = asString(input.command.name, "")
        || asString(input.command.label, "")
        || asString(input.command.title, "")
        || "workspace command";
    const command = asString(input.command.command, "");
    const templateData = buildTemplateData({
        workspace: input.workspace,
        agent: input.agent,
        issue: input.issue,
        adapterEnv: input.adapterEnv,
        port: null,
    });
    const cwd = resolveConfiguredPath(renderTemplate(asString(input.command.cwd, "."), templateData), input.workspace.cwd);
    const env = {
        ...sanitizeRuntimeServiceBaseEnv(process.env),
        ...input.adapterEnv,
        ...renderRuntimeServiceEnv({
            envConfig: parseObject(input.command.env),
            templateData,
        }),
    };
    return {
        name,
        command,
        cwd,
        env,
    };
}
export async function runWorkspaceJobForControl(input) {
    const resolved = resolveWorkspaceCommandExecution({
        command: input.command,
        workspace: input.workspace,
        agent: input.actor,
        issue: input.issue,
        adapterEnv: input.adapterEnv ?? {},
    });
    if (!resolved.command) {
        throw new Error(`Workspace job "${resolved.name}" is missing command`);
    }
    await ensureServerWorkspaceLinksCurrent(resolved.cwd);
    return await recordWorkspaceCommandOperation(input.recorder, {
        phase: "workspace_provision",
        command: resolved.command,
        cwd: resolved.cwd,
        env: resolved.env,
        label: `Workspace job "${resolved.name}"`,
        metadata: {
            workspaceCommandKind: "job",
            workspaceCommandName: resolved.name,
            ...(input.metadata ?? {}),
        },
        successMessage: `Completed workspace job "${resolved.name}"\n`,
    });
}
function resolveServiceScopeId(input) {
    const scopeTypeRaw = asString(input.service.reuseScope, input.service.lifecycle === "shared" ? "project_workspace" : "run");
    const scopeType = scopeTypeRaw === "project_workspace" ||
        scopeTypeRaw === "execution_workspace" ||
        scopeTypeRaw === "agent"
        ? scopeTypeRaw
        : "run";
    if (scopeType === "project_workspace")
        return { scopeType, scopeId: input.workspace.workspaceId ?? input.workspace.projectId };
    if (scopeType === "execution_workspace") {
        return { scopeType, scopeId: input.executionWorkspaceId ?? input.workspace.cwd };
    }
    if (scopeType === "agent")
        return { scopeType, scopeId: input.agent.id };
    return { scopeType: "run", scopeId: input.runId };
}
function looksLikeWorkspaceDevServerCommand(command) {
    const normalized = command.trim().toLowerCase();
    if (!normalized)
        return false;
    return /(?:^|\s)(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?dev(?:\s|$)/.test(normalized);
}
export function resolveWorkspaceRuntimeReadinessTimeoutSec(service) {
    const readiness = parseObject(service.readiness);
    const explicitTimeoutSec = asNumber(readiness.timeoutSec, 0);
    if (explicitTimeoutSec > 0) {
        return Math.max(1, explicitTimeoutSec);
    }
    return looksLikeWorkspaceDevServerCommand(asString(service.command, "")) ? 90 : 30;
}
async function waitForReadiness(input) {
    const readiness = parseObject(input.service.readiness);
    const readinessType = asString(readiness.type, "");
    if (readinessType !== "http" || !input.url)
        return;
    const timeoutSec = resolveWorkspaceRuntimeReadinessTimeoutSec(input.service);
    const intervalMs = Math.max(100, asNumber(readiness.intervalMs, 500));
    const deadline = Date.now() + timeoutSec * 1000;
    let lastError = "service did not become ready";
    while (Date.now() < deadline) {
        try {
            const response = await fetch(input.url);
            if (response.ok)
                return;
            lastError = `received HTTP ${response.status}`;
        }
        catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
        }
        await delay(intervalMs);
    }
    throw new Error(`Readiness check failed for ${input.url}: ${lastError}`);
}
async function isRuntimeServiceUrlHealthy(url) {
    if (!url)
        return true;
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
        return response.ok;
    }
    catch {
        return false;
    }
}
function toPersistedWorkspaceRuntimeService(record) {
    return {
        id: record.id,
        companyId: record.companyId,
        projectId: record.projectId,
        projectWorkspaceId: record.projectWorkspaceId,
        executionWorkspaceId: record.executionWorkspaceId,
        issueId: record.issueId,
        scopeType: record.scopeType,
        scopeId: record.scopeId,
        serviceName: record.serviceName,
        status: record.status,
        lifecycle: record.lifecycle,
        reuseKey: record.reuseKey,
        command: record.command,
        cwd: record.cwd,
        port: record.port,
        url: record.url,
        provider: record.provider,
        providerRef: record.providerRef,
        ownerAgentId: record.ownerAgentId,
        startedByRunId: record.startedByRunId,
        lastUsedAt: new Date(record.lastUsedAt),
        startedAt: new Date(record.startedAt),
        stoppedAt: record.stoppedAt ? new Date(record.stoppedAt) : null,
        stopPolicy: record.stopPolicy,
        healthStatus: record.healthStatus,
        updatedAt: new Date(),
    };
}
async function persistRuntimeServiceRecord(db, record) {
    if (!db)
        return;
    const values = toPersistedWorkspaceRuntimeService(record);
    await db
        .insert(workspaceRuntimeServices)
        .values(values)
        .onConflictDoUpdate({
        target: workspaceRuntimeServices.id,
        set: {
            projectId: values.projectId,
            projectWorkspaceId: values.projectWorkspaceId,
            executionWorkspaceId: values.executionWorkspaceId,
            issueId: values.issueId,
            scopeType: values.scopeType,
            scopeId: values.scopeId,
            serviceName: values.serviceName,
            status: values.status,
            lifecycle: values.lifecycle,
            reuseKey: values.reuseKey,
            command: values.command,
            cwd: values.cwd,
            port: values.port,
            url: values.url,
            provider: values.provider,
            providerRef: values.providerRef,
            ownerAgentId: values.ownerAgentId,
            startedByRunId: values.startedByRunId,
            lastUsedAt: values.lastUsedAt,
            startedAt: values.startedAt,
            stoppedAt: values.stoppedAt,
            stopPolicy: values.stopPolicy,
            healthStatus: values.healthStatus,
            updatedAt: values.updatedAt,
        },
    });
}
async function findStoppedRuntimeServiceReuseCandidate(input) {
    if (!input.db || !input.reuseKey)
        return null;
    const row = await input.db
        .select({
        id: workspaceRuntimeServices.id,
        port: workspaceRuntimeServices.port,
    })
        .from(workspaceRuntimeServices)
        .where(and(eq(workspaceRuntimeServices.companyId, input.companyId), eq(workspaceRuntimeServices.reuseKey, input.reuseKey), eq(workspaceRuntimeServices.provider, "local_process"), eq(workspaceRuntimeServices.status, "stopped")))
        .orderBy(desc(workspaceRuntimeServices.updatedAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);
    return row ?? null;
}
function clearIdleTimer(record) {
    if (!record.idleTimer)
        return;
    clearTimeout(record.idleTimer);
    record.idleTimer = null;
}
export function normalizeAdapterManagedRuntimeServices(input) {
    const nowIso = (input.now ?? new Date()).toISOString();
    return input.reports.map((report) => {
        const scopeType = report.scopeType ?? "run";
        const scopeId = report.scopeId ??
            (scopeType === "project_workspace"
                ? input.workspace.workspaceId
                : scopeType === "execution_workspace"
                    ? input.executionWorkspaceId ?? input.workspace.cwd
                    : scopeType === "agent"
                        ? input.agent.id
                        : input.runId) ??
            null;
        const serviceName = asString(report.serviceName, "").trim() || "service";
        const status = report.status ?? "running";
        const lifecycle = report.lifecycle ?? "ephemeral";
        const healthStatus = report.healthStatus ??
            (status === "running" ? "healthy" : status === "failed" ? "unhealthy" : "unknown");
        return {
            id: stableRuntimeServiceId({
                adapterType: input.adapterType,
                runId: input.runId,
                scopeType,
                scopeId,
                serviceName,
                reportId: report.id ?? null,
                providerRef: report.providerRef ?? null,
                reuseKey: report.reuseKey ?? null,
            }),
            companyId: input.agent.companyId,
            projectId: report.projectId ?? input.workspace.projectId,
            projectWorkspaceId: report.projectWorkspaceId ?? input.workspace.workspaceId,
            executionWorkspaceId: input.executionWorkspaceId ?? null,
            issueId: report.issueId ?? input.issue?.id ?? null,
            serviceName,
            status,
            lifecycle,
            scopeType,
            scopeId,
            reuseKey: report.reuseKey ?? null,
            command: report.command ?? null,
            cwd: report.cwd ?? null,
            port: report.port ?? null,
            url: report.url ?? null,
            provider: "adapter_managed",
            providerRef: report.providerRef ?? null,
            ownerAgentId: report.ownerAgentId ?? input.agent.id ?? null,
            startedByRunId: input.runId,
            lastUsedAt: nowIso,
            startedAt: nowIso,
            stoppedAt: status === "running" || status === "starting" ? null : nowIso,
            stopPolicy: report.stopPolicy ?? null,
            healthStatus,
            reused: false,
        };
    });
}
async function startLocalRuntimeService(input) {
    const leaseRunId = input.leaseRunId === undefined ? input.runId : input.leaseRunId;
    const startedByRunId = input.startedByRunId === undefined ? input.runId : input.startedByRunId;
    const identity = resolveRuntimeServiceReuseIdentity({
        service: input.service,
        workspace: input.workspace,
        agent: input.agent,
        issue: input.issue,
        adapterEnv: input.adapterEnv,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
    });
    const serviceName = identity.serviceName;
    const lifecycle = identity.lifecycle;
    const command = identity.command;
    if (!command)
        throw new Error(`Runtime service "${serviceName}" is missing command`);
    const portConfig = parseObject(input.service.port);
    const envConfig = identity.envConfig;
    const envFingerprint = identity.envFingerprint;
    const serviceIdentityFingerprint = input.reuseKey ?? envFingerprint;
    const explicitPort = identity.explicitPort;
    const identityPort = identity.identityPort;
    const stoppedReuseCandidate = await findStoppedRuntimeServiceReuseCandidate({
        db: input.db,
        companyId: input.agent.companyId,
        reuseKey: input.reuseKey,
    });
    const reusableStoppedPort = asString(portConfig.type, "") === "auto" && stoppedReuseCandidate?.port
        ? (await readLocalServicePortOwner(stoppedReuseCandidate.port))
            ? null
            : stoppedReuseCandidate.port
        : null;
    const port = asString(portConfig.type, "") === "auto"
        ? (reusableStoppedPort ?? await allocatePort())
        : explicitPort > 0
            ? explicitPort
            : null;
    const templateData = buildTemplateData({
        workspace: input.workspace,
        agent: input.agent,
        issue: input.issue,
        adapterEnv: input.adapterEnv,
        port,
    });
    const serviceCwd = port === identityPort
        ? identity.serviceCwd
        : resolveConfiguredPath(renderTemplate(asString(input.service.cwd, "."), templateData), input.workspace.cwd);
    const env = {
        ...sanitizeRuntimeServiceBaseEnv(process.env),
        ...input.adapterEnv,
    };
    for (const [key, value] of Object.entries(renderRuntimeServiceEnv({ envConfig, templateData }))) {
        env[key] = value;
    }
    if (port) {
        const portEnvKey = asString(portConfig.envKey, "PORT");
        env[portEnvKey] = String(port);
    }
    const expose = parseObject(input.service.expose);
    const readiness = parseObject(input.service.readiness);
    const urlTemplate = asString(expose.urlTemplate, "") ||
        asString(readiness.urlTemplate, "");
    const url = urlTemplate ? renderTemplate(urlTemplate, templateData) : null;
    const stopPolicy = parseObject(input.service.stopPolicy);
    const serviceKey = createLocalServiceKey({
        profileKind: "workspace-runtime",
        serviceName,
        cwd: serviceCwd,
        command,
        envFingerprint: serviceIdentityFingerprint,
        port: identityPort,
        scope: {
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            executionWorkspaceId: input.executionWorkspaceId ?? null,
            reuseKey: input.reuseKey,
        },
    });
    const adoptedRecord = await findAdoptableLocalService({
        serviceKey,
        command,
        cwd: serviceCwd,
        envFingerprint: serviceIdentityFingerprint,
        port: identityPort,
    });
    if (adoptedRecord) {
        return {
            id: adoptedRecord.runtimeServiceId ?? randomUUID(),
            companyId: input.agent.companyId,
            projectId: input.workspace.projectId,
            projectWorkspaceId: input.workspace.workspaceId,
            executionWorkspaceId: input.executionWorkspaceId ?? null,
            issueId: input.issue?.id ?? null,
            serviceName,
            status: "running",
            lifecycle,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            reuseKey: input.reuseKey,
            command,
            cwd: serviceCwd,
            port: adoptedRecord.port ?? port,
            url: adoptedRecord.url ?? url,
            provider: "local_process",
            providerRef: String(adoptedRecord.pid),
            ownerAgentId: input.agent.id ?? null,
            startedByRunId,
            lastUsedAt: new Date().toISOString(),
            startedAt: adoptedRecord.startedAt,
            stoppedAt: null,
            stopPolicy,
            healthStatus: "healthy",
            reused: true,
            db: input.db,
            child: null,
            leaseRunIds: leaseRunId ? new Set([leaseRunId]) : new Set(),
            idleTimer: null,
            envFingerprint,
            serviceKey,
            profileKind: "workspace-runtime",
            processGroupId: adoptedRecord.processGroupId ?? null,
        };
    }
    if (identityPort) {
        const ownerPid = await readLocalServicePortOwner(identityPort);
        if (ownerPid) {
            throw new Error(`Runtime service "${serviceName}" could not start because port ${identityPort} is already in use by pid ${ownerPid}`);
        }
    }
    await ensureServerWorkspaceLinksCurrent(serviceCwd, {
        onLog: input.onLog,
    });
    const shell = resolveShell();
    const child = spawn(shell, ["-lc", command], {
        cwd: serviceCwd,
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
    });
    const spawnErrorPromise = new Promise((_, reject) => {
        child.once("error", (err) => {
            reject(err);
        });
    });
    let stderrExcerpt = "";
    let stdoutExcerpt = "";
    child.stdout?.on("data", async (chunk) => {
        const text = String(chunk);
        stdoutExcerpt = (stdoutExcerpt + text).slice(-4096);
        if (input.onLog)
            await input.onLog("stdout", `[service:${serviceName}] ${text}`);
    });
    child.stderr?.on("data", async (chunk) => {
        const text = String(chunk);
        stderrExcerpt = (stderrExcerpt + text).slice(-4096);
        if (input.onLog)
            await input.onLog("stderr", `[service:${serviceName}] ${text}`);
    });
    try {
        await Promise.race([
            waitForReadiness({ service: input.service, url }),
            spawnErrorPromise,
        ]);
    }
    catch (err) {
        terminateChildProcess(child);
        throw new Error(`Failed to start runtime service "${serviceName}": ${err instanceof Error ? err.message : String(err)}${stderrExcerpt ? ` | stderr: ${stderrExcerpt.trim()}` : ""}`);
    }
    const record = {
        id: stoppedReuseCandidate?.id ?? randomUUID(),
        companyId: input.agent.companyId,
        projectId: input.workspace.projectId,
        projectWorkspaceId: input.workspace.workspaceId,
        executionWorkspaceId: input.executionWorkspaceId ?? null,
        issueId: input.issue?.id ?? null,
        serviceName,
        status: "running",
        lifecycle,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        reuseKey: input.reuseKey,
        command,
        cwd: serviceCwd,
        port,
        url,
        provider: "local_process",
        providerRef: child.pid ? String(child.pid) : null,
        ownerAgentId: input.agent.id ?? null,
        startedByRunId,
        lastUsedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        stoppedAt: null,
        stopPolicy,
        healthStatus: "healthy",
        reused: false,
        db: input.db,
        child,
        leaseRunIds: leaseRunId ? new Set([leaseRunId]) : new Set(),
        idleTimer: null,
        envFingerprint,
        serviceKey,
        profileKind: "workspace-runtime",
        processGroupId: child.pid ?? null,
    };
    if (child.pid) {
        await writeLocalServiceRegistryRecord({
            version: 1,
            serviceKey,
            profileKind: "workspace-runtime",
            serviceName,
            command,
            cwd: serviceCwd,
            envFingerprint: serviceIdentityFingerprint,
            port,
            url,
            pid: child.pid,
            processGroupId: child.pid,
            provider: "local_process",
            runtimeServiceId: record.id,
            reuseKey: input.reuseKey,
            startedAt: record.startedAt,
            lastSeenAt: record.lastUsedAt,
            metadata: {
                projectId: record.projectId,
                projectWorkspaceId: record.projectWorkspaceId,
                executionWorkspaceId: record.executionWorkspaceId,
                issueId: record.issueId,
                scopeType: record.scopeType,
                scopeId: record.scopeId,
            },
        });
    }
    return record;
}
function scheduleIdleStop(record) {
    clearIdleTimer(record);
    const stopType = asString(record.stopPolicy?.type, "manual");
    if (stopType !== "idle_timeout")
        return;
    const idleSeconds = Math.max(1, asNumber(record.stopPolicy?.idleSeconds, 1800));
    record.idleTimer = setTimeout(() => {
        stopRuntimeService(record.id).catch(() => undefined);
    }, idleSeconds * 1000);
}
async function stopRuntimeService(serviceId) {
    const record = runtimeServicesById.get(serviceId);
    if (!record)
        return;
    clearIdleTimer(record);
    record.status = "stopped";
    record.healthStatus = "unknown";
    record.lastUsedAt = new Date().toISOString();
    record.stoppedAt = new Date().toISOString();
    runtimeServicesById.delete(serviceId);
    if (record.reuseKey && runtimeServicesByReuseKey.get(record.reuseKey) === record.id) {
        runtimeServicesByReuseKey.delete(record.reuseKey);
    }
    if (record.child && record.child.pid) {
        await terminateLocalService({
            pid: record.child.pid,
            processGroupId: record.processGroupId ?? record.child.pid,
        });
    }
    else if (record.providerRef) {
        const pid = Number.parseInt(record.providerRef, 10);
        if (Number.isInteger(pid) && pid > 0) {
            await terminateLocalService({
                pid,
                processGroupId: record.processGroupId,
            });
        }
    }
    await removeLocalServiceRegistryRecord(record.serviceKey);
    await persistRuntimeServiceRecord(record.db, record);
}
async function markPersistedRuntimeServicesStoppedForExecutionWorkspace(input) {
    const now = new Date();
    await input.db
        .update(workspaceRuntimeServices)
        .set({
        status: "stopped",
        healthStatus: "unknown",
        stoppedAt: now,
        lastUsedAt: now,
        updatedAt: now,
    })
        .where(and(eq(workspaceRuntimeServices.executionWorkspaceId, input.executionWorkspaceId), inArray(workspaceRuntimeServices.status, ["starting", "running"])));
}
function registerRuntimeService(db, record) {
    record.db = db;
    runtimeServicesById.set(record.id, record);
    if (record.reuseKey) {
        runtimeServicesByReuseKey.set(record.reuseKey, record.id);
    }
    record.child?.on("exit", (code, signal) => {
        const current = runtimeServicesById.get(record.id);
        if (!current)
            return;
        clearIdleTimer(current);
        current.status = code === 0 || signal === "SIGTERM" ? "stopped" : "failed";
        current.healthStatus = current.status === "failed" ? "unhealthy" : "unknown";
        current.lastUsedAt = new Date().toISOString();
        current.stoppedAt = new Date().toISOString();
        runtimeServicesById.delete(current.id);
        if (current.reuseKey && runtimeServicesByReuseKey.get(current.reuseKey) === current.id) {
            runtimeServicesByReuseKey.delete(current.reuseKey);
        }
        void removeLocalServiceRegistryRecord(current.serviceKey);
        void persistRuntimeServiceRecord(db, current);
    });
}
function readRuntimeServiceEntries(config) {
    return listWorkspaceServiceCommandDefinitions(parseObject(config.workspaceRuntime))
        .map((command) => command.rawConfig);
}
export function listConfiguredRuntimeServiceEntries(config) {
    return readRuntimeServiceEntries(config);
}
function readConfiguredServiceStates(config) {
    const raw = parseObject(config.serviceStates);
    const states = {};
    for (const [key, value] of Object.entries(raw)) {
        if (value === "running" || value === "stopped" || value === "manual") {
            states[key] = value;
        }
    }
    return states;
}
function readDesiredRuntimeState(value) {
    return value === "running" || value === "stopped" || value === "manual" ? value : null;
}
export function buildWorkspaceRuntimeDesiredStatePatch(input) {
    const configuredServices = listConfiguredRuntimeServiceEntries(input.config);
    const fallbackState = readDesiredRuntimeState(input.currentDesiredState) ?? "stopped";
    const nextServiceStates = {};
    for (let index = 0; index < configuredServices.length; index += 1) {
        nextServiceStates[String(index)] = input.currentServiceStates?.[String(index)] ?? fallbackState;
    }
    const nextState = input.action === "stop" ? "stopped" : "running";
    const applyActionState = (index) => {
        const key = String(index);
        // Manual services are intentionally left under operator control even when
        // an API action targets that individual service.
        if (nextServiceStates[key] === "manual")
            return;
        nextServiceStates[key] = nextState;
    };
    if (input.serviceIndex === undefined || input.serviceIndex === null) {
        for (let index = 0; index < configuredServices.length; index += 1) {
            applyActionState(index);
        }
    }
    else if (input.serviceIndex >= 0 && input.serviceIndex < configuredServices.length) {
        applyActionState(input.serviceIndex);
    }
    const desiredState = Object.values(nextServiceStates).some((state) => state === "running")
        ? "running"
        : Object.values(nextServiceStates).some((state) => state === "manual")
            ? "manual"
            : "stopped";
    return {
        desiredState,
        serviceStates: Object.keys(nextServiceStates).length > 0 ? nextServiceStates : null,
    };
}
function selectRuntimeServiceEntries(input) {
    const entries = listConfiguredRuntimeServiceEntries(input.config);
    const states = input.serviceStates ?? readConfiguredServiceStates(input.config);
    const fallbackState = readDesiredRuntimeState(input.defaultDesiredState) ?? "stopped";
    return entries.filter((_, index) => {
        if (input.serviceIndex !== undefined && input.serviceIndex !== null) {
            return index === input.serviceIndex;
        }
        if (!input.respectDesiredStates)
            return true;
        return (states[String(index)] ?? fallbackState) === "running";
    });
}
export async function ensureRuntimeServicesForRun(input) {
    const rawServices = selectRuntimeServiceEntries({
        config: input.config,
        respectDesiredStates: true,
        defaultDesiredState: readDesiredRuntimeState(input.config.desiredState) ?? "running",
        serviceStates: readConfiguredServiceStates(input.config),
    });
    const acquiredServiceIds = [];
    const refs = [];
    runtimeServiceLeasesByRun.set(input.runId, acquiredServiceIds);
    try {
        for (const service of rawServices) {
            const { scopeType, scopeId } = resolveServiceScopeId({
                service,
                workspace: input.workspace,
                executionWorkspaceId: input.executionWorkspaceId,
                issue: input.issue,
                runId: input.runId,
                agent: input.agent,
            });
            const reuseKey = resolveRuntimeServiceReuseIdentity({
                service,
                workspace: input.workspace,
                agent: input.agent,
                issue: input.issue,
                adapterEnv: input.adapterEnv,
                scopeType,
                scopeId,
            }).reuseKey;
            if (reuseKey) {
                const existingId = runtimeServicesByReuseKey.get(reuseKey);
                const existing = existingId ? runtimeServicesById.get(existingId) : null;
                if (existing && existing.status === "running") {
                    existing.leaseRunIds.add(input.runId);
                    existing.lastUsedAt = new Date().toISOString();
                    existing.stoppedAt = null;
                    clearIdleTimer(existing);
                    void touchLocalServiceRegistryRecord(existing.serviceKey, {
                        runtimeServiceId: existing.id,
                        lastSeenAt: existing.lastUsedAt,
                    });
                    await persistRuntimeServiceRecord(input.db, existing);
                    acquiredServiceIds.push(existing.id);
                    refs.push(toRuntimeServiceRef(existing, { reused: true }));
                    continue;
                }
            }
            const record = await startLocalRuntimeService({
                db: input.db,
                runId: input.runId,
                agent: input.agent,
                issue: input.issue,
                workspace: input.workspace,
                executionWorkspaceId: input.executionWorkspaceId,
                adapterEnv: input.adapterEnv,
                service,
                onLog: input.onLog,
                reuseKey,
                scopeType,
                scopeId,
            });
            registerRuntimeService(input.db, record);
            await persistRuntimeServiceRecord(input.db, record);
            acquiredServiceIds.push(record.id);
            refs.push(toRuntimeServiceRef(record));
        }
    }
    catch (err) {
        await releaseRuntimeServicesForRun(input.runId);
        throw err;
    }
    return refs;
}
export async function startRuntimeServicesForWorkspaceControl(input) {
    const rawServices = selectRuntimeServiceEntries({
        config: input.config,
        serviceIndex: input.serviceIndex,
        respectDesiredStates: input.respectDesiredStates,
        defaultDesiredState: readDesiredRuntimeState(input.config.desiredState) ?? "stopped",
        serviceStates: readConfiguredServiceStates(input.config),
    });
    const refs = [];
    const invocationId = input.invocationId ?? randomUUID();
    for (const service of rawServices) {
        const { scopeType, scopeId } = resolveServiceScopeId({
            service,
            workspace: input.workspace,
            executionWorkspaceId: input.executionWorkspaceId,
            issue: input.issue,
            runId: invocationId,
            agent: input.actor,
        });
        const reuseKey = resolveRuntimeServiceReuseIdentity({
            service,
            workspace: input.workspace,
            agent: input.actor,
            issue: input.issue,
            adapterEnv: input.adapterEnv,
            scopeType,
            scopeId,
        }).reuseKey;
        if (reuseKey) {
            const existingId = runtimeServicesByReuseKey.get(reuseKey);
            const existing = existingId ? runtimeServicesById.get(existingId) : null;
            if (existing && existing.status === "running") {
                existing.lastUsedAt = new Date().toISOString();
                existing.stoppedAt = null;
                clearIdleTimer(existing);
                void touchLocalServiceRegistryRecord(existing.serviceKey, {
                    runtimeServiceId: existing.id,
                    lastSeenAt: existing.lastUsedAt,
                });
                await persistRuntimeServiceRecord(input.db, existing);
                refs.push(toRuntimeServiceRef(existing, { reused: true }));
                continue;
            }
        }
        // Manually controlled services are not tied to a heartbeat run lifecycle, so they do not
        // retain a run lease and never persist a startedByRunId foreign key.
        const record = await startLocalRuntimeService({
            db: input.db,
            runId: invocationId,
            leaseRunId: null,
            startedByRunId: null,
            agent: input.actor,
            issue: input.issue,
            workspace: input.workspace,
            executionWorkspaceId: input.executionWorkspaceId,
            adapterEnv: input.adapterEnv,
            service,
            onLog: input.onLog,
            reuseKey,
            scopeType,
            scopeId,
        });
        registerRuntimeService(input.db, record);
        await persistRuntimeServiceRecord(input.db, record);
        refs.push(toRuntimeServiceRef(record));
    }
    return refs;
}
export async function releaseRuntimeServicesForRun(runId) {
    const acquired = runtimeServiceLeasesByRun.get(runId) ?? [];
    runtimeServiceLeasesByRun.delete(runId);
    for (const serviceId of acquired) {
        const record = runtimeServicesById.get(serviceId);
        if (!record)
            continue;
        record.leaseRunIds.delete(runId);
        record.lastUsedAt = new Date().toISOString();
        const stopType = asString(record.stopPolicy?.type, record.lifecycle === "ephemeral" ? "on_run_finish" : "manual");
        await persistRuntimeServiceRecord(record.db, record);
        if (record.leaseRunIds.size === 0) {
            if (record.lifecycle === "ephemeral" || stopType === "on_run_finish") {
                await stopRuntimeService(serviceId);
                continue;
            }
            scheduleIdleStop(record);
        }
    }
}
export async function stopRuntimeServicesForExecutionWorkspace(input) {
    const normalizedWorkspaceCwd = input.workspaceCwd ? path.resolve(input.workspaceCwd) : null;
    const matchingServiceIds = Array.from(runtimeServicesById.values())
        .filter((record) => {
        if (input.runtimeServiceId)
            return record.id === input.runtimeServiceId;
        if (record.executionWorkspaceId === input.executionWorkspaceId)
            return true;
        if (!normalizedWorkspaceCwd || !record.cwd)
            return false;
        const resolvedCwd = path.resolve(record.cwd);
        return (resolvedCwd === normalizedWorkspaceCwd ||
            resolvedCwd.startsWith(`${normalizedWorkspaceCwd}${path.sep}`));
    })
        .map((record) => record.id);
    for (const serviceId of matchingServiceIds) {
        await stopRuntimeService(serviceId);
    }
    if (input.db) {
        if (input.runtimeServiceId) {
            const now = new Date();
            await input.db
                .update(workspaceRuntimeServices)
                .set({
                status: "stopped",
                healthStatus: "unknown",
                stoppedAt: now,
                lastUsedAt: now,
                updatedAt: now,
            })
                .where(eq(workspaceRuntimeServices.id, input.runtimeServiceId));
        }
        else {
            await markPersistedRuntimeServicesStoppedForExecutionWorkspace({
                db: input.db,
                executionWorkspaceId: input.executionWorkspaceId,
            });
        }
    }
}
export async function stopRuntimeServicesForProjectWorkspace(input) {
    const matchingServiceIds = Array.from(runtimeServicesById.values())
        .filter((record) => {
        if (input.runtimeServiceId)
            return record.id === input.runtimeServiceId;
        return record.projectWorkspaceId === input.projectWorkspaceId && record.scopeType === "project_workspace";
    })
        .map((record) => record.id);
    for (const serviceId of matchingServiceIds) {
        await stopRuntimeService(serviceId);
    }
    if (input.db) {
        const now = new Date();
        await input.db
            .update(workspaceRuntimeServices)
            .set({
            status: "stopped",
            healthStatus: "unknown",
            stoppedAt: now,
            lastUsedAt: now,
            updatedAt: now,
        })
            .where(input.runtimeServiceId
            ? eq(workspaceRuntimeServices.id, input.runtimeServiceId)
            : and(eq(workspaceRuntimeServices.projectWorkspaceId, input.projectWorkspaceId), eq(workspaceRuntimeServices.scopeType, "project_workspace"), inArray(workspaceRuntimeServices.status, ["starting", "running"])));
    }
}
export async function listWorkspaceRuntimeServicesForProjectWorkspaces(db, companyId, projectWorkspaceIds) {
    if (projectWorkspaceIds.length === 0)
        return new Map();
    const rows = await db
        .select()
        .from(workspaceRuntimeServices)
        .where(and(eq(workspaceRuntimeServices.companyId, companyId), inArray(workspaceRuntimeServices.projectWorkspaceId, projectWorkspaceIds), eq(workspaceRuntimeServices.scopeType, "project_workspace")))
        .orderBy(desc(workspaceRuntimeServices.updatedAt), desc(workspaceRuntimeServices.createdAt));
    const grouped = new Map();
    for (const row of rows) {
        if (!row.projectWorkspaceId)
            continue;
        const existing = grouped.get(row.projectWorkspaceId);
        if (existing)
            existing.push(row);
        else
            grouped.set(row.projectWorkspaceId, [row]);
    }
    return grouped;
}
export async function reconcilePersistedRuntimeServicesOnStartup(db) {
    const rows = await db
        .select()
        .from(workspaceRuntimeServices)
        .where(and(eq(workspaceRuntimeServices.provider, "local_process"), inArray(workspaceRuntimeServices.status, ["starting", "running"])));
    if (rows.length === 0)
        return { reconciled: 0, adopted: 0, stopped: 0 };
    let adopted = 0;
    let stopped = 0;
    for (const row of rows) {
        const adoptedRecord = await findLocalServiceRegistryRecordByRuntimeServiceId({
            runtimeServiceId: row.id,
            profileKind: "workspace-runtime",
        });
        if (adoptedRecord) {
            const adoptedUrl = adoptedRecord.url ?? row.url ?? null;
            if (!(await isRuntimeServiceUrlHealthy(adoptedUrl))) {
                await removeLocalServiceRegistryRecord(adoptedRecord.serviceKey);
            }
            else {
                const record = {
                    id: row.id,
                    companyId: row.companyId,
                    projectId: row.projectId ?? null,
                    projectWorkspaceId: row.projectWorkspaceId ?? null,
                    executionWorkspaceId: row.executionWorkspaceId ?? null,
                    issueId: row.issueId ?? null,
                    serviceName: row.serviceName,
                    status: "running",
                    lifecycle: row.lifecycle,
                    scopeType: row.scopeType,
                    scopeId: row.scopeId ?? null,
                    reuseKey: row.reuseKey ?? null,
                    command: row.command ?? null,
                    cwd: row.cwd ?? null,
                    port: adoptedRecord.port ?? row.port ?? null,
                    url: adoptedRecord.url ?? row.url ?? null,
                    provider: "local_process",
                    providerRef: String(adoptedRecord.pid),
                    ownerAgentId: row.ownerAgentId ?? null,
                    startedByRunId: row.startedByRunId ?? null,
                    lastUsedAt: new Date().toISOString(),
                    startedAt: row.startedAt.toISOString(),
                    stoppedAt: null,
                    stopPolicy: row.stopPolicy ?? null,
                    healthStatus: "healthy",
                    reused: true,
                    db,
                    child: null,
                    leaseRunIds: new Set(),
                    idleTimer: null,
                    envFingerprint: row.reuseKey ?? "",
                    serviceKey: adoptedRecord.serviceKey,
                    profileKind: "workspace-runtime",
                    processGroupId: adoptedRecord.processGroupId ?? null,
                };
                registerRuntimeService(db, record);
                await touchLocalServiceRegistryRecord(adoptedRecord.serviceKey, {
                    runtimeServiceId: row.id,
                    lastSeenAt: record.lastUsedAt,
                });
                await persistRuntimeServiceRecord(db, record);
                adopted += 1;
                continue;
            }
        }
        const now = new Date();
        await db
            .update(workspaceRuntimeServices)
            .set({
            status: "stopped",
            healthStatus: "unknown",
            stoppedAt: now,
            lastUsedAt: now,
            updatedAt: now,
        })
            .where(eq(workspaceRuntimeServices.id, row.id));
        const registryRecord = await findLocalServiceRegistryRecordByRuntimeServiceId({
            runtimeServiceId: row.id,
            profileKind: "workspace-runtime",
        });
        if (registryRecord) {
            await removeLocalServiceRegistryRecord(registryRecord.serviceKey);
        }
        stopped += 1;
    }
    return { reconciled: rows.length, adopted, stopped };
}
export async function restartDesiredRuntimeServicesOnStartup(db) {
    let restarted = 0;
    let failed = 0;
    const projectWorkspaceRows = await db
        .select()
        .from(projectWorkspaces);
    const projectWorkspaceRowsById = new Map(projectWorkspaceRows.map((row) => [row.id, row]));
    for (const row of projectWorkspaceRows) {
        const runtimeConfig = readProjectWorkspaceRuntimeConfig(row.metadata ?? null);
        if (runtimeConfig?.desiredState !== "running" || !runtimeConfig.workspaceRuntime || !row.cwd)
            continue;
        try {
            const refs = await startRuntimeServicesForWorkspaceControl({
                db,
                actor: { id: null, name: "Paperclip", companyId: row.companyId },
                issue: null,
                workspace: {
                    baseCwd: row.cwd,
                    source: "project_primary",
                    projectId: row.projectId,
                    workspaceId: row.id,
                    repoUrl: row.repoUrl ?? null,
                    repoRef: row.repoRef ?? null,
                    strategy: "project_primary",
                    cwd: row.cwd,
                    branchName: row.defaultRef ?? row.repoRef ?? null,
                    worktreePath: null,
                    warnings: [],
                    created: false,
                },
                config: {
                    workspaceRuntime: runtimeConfig.workspaceRuntime,
                    desiredState: runtimeConfig.desiredState,
                    serviceStates: runtimeConfig.serviceStates ?? null,
                },
                adapterEnv: {},
                respectDesiredStates: true,
            });
            if (refs.length > 0)
                restarted += refs.filter((ref) => !ref.reused).length;
        }
        catch {
            failed += 1;
        }
    }
    const executionWorkspaceRows = await db
        .select()
        .from(executionWorkspaces)
        .where(inArray(executionWorkspaces.status, ["active", "idle", "in_review", "cleanup_failed"]));
    for (const row of executionWorkspaceRows) {
        const config = readExecutionWorkspaceConfig(row.metadata ?? null);
        const inheritedRuntimeConfig = row.projectWorkspaceId
            ? readProjectWorkspaceRuntimeConfig(projectWorkspaceRowsById.get(row.projectWorkspaceId)?.metadata ?? null)?.workspaceRuntime ?? null
            : null;
        const effectiveRuntimeConfig = config?.workspaceRuntime ?? inheritedRuntimeConfig;
        if (config?.desiredState !== "running" || !effectiveRuntimeConfig || !row.cwd)
            continue;
        try {
            const refs = await startRuntimeServicesForWorkspaceControl({
                db,
                actor: { id: null, name: "Paperclip", companyId: row.companyId },
                issue: row.sourceIssueId
                    ? {
                        id: row.sourceIssueId,
                        identifier: null,
                        title: row.name,
                    }
                    : null,
                workspace: {
                    baseCwd: row.cwd,
                    source: row.mode === "shared_workspace" ? "project_primary" : "task_session",
                    projectId: row.projectId,
                    workspaceId: row.projectWorkspaceId ?? null,
                    repoUrl: row.repoUrl ?? null,
                    repoRef: row.baseRef ?? null,
                    strategy: row.strategyType === "git_worktree" ? "git_worktree" : "project_primary",
                    cwd: row.cwd,
                    branchName: row.branchName ?? null,
                    worktreePath: row.strategyType === "git_worktree" ? row.cwd : null,
                    warnings: [],
                    created: false,
                },
                executionWorkspaceId: row.id,
                config: {
                    workspaceRuntime: effectiveRuntimeConfig,
                    desiredState: config.desiredState,
                    serviceStates: config.serviceStates ?? null,
                },
                adapterEnv: {},
                respectDesiredStates: true,
            });
            if (refs.length > 0)
                restarted += refs.filter((ref) => !ref.reused).length;
        }
        catch {
            failed += 1;
        }
    }
    return { restarted, failed };
}
export async function persistAdapterManagedRuntimeServices(input) {
    const refs = normalizeAdapterManagedRuntimeServices(input);
    if (refs.length === 0)
        return refs;
    const existingRows = await input.db
        .select()
        .from(workspaceRuntimeServices)
        .where(inArray(workspaceRuntimeServices.id, refs.map((ref) => ref.id)));
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    for (const ref of refs) {
        const existing = existingById.get(ref.id);
        const startedAt = existing?.startedAt ?? new Date(ref.startedAt);
        const createdAt = existing?.createdAt ?? new Date();
        await input.db
            .insert(workspaceRuntimeServices)
            .values({
            id: ref.id,
            companyId: ref.companyId,
            projectId: ref.projectId,
            projectWorkspaceId: ref.projectWorkspaceId,
            executionWorkspaceId: ref.executionWorkspaceId,
            issueId: ref.issueId,
            scopeType: ref.scopeType,
            scopeId: ref.scopeId,
            serviceName: ref.serviceName,
            status: ref.status,
            lifecycle: ref.lifecycle,
            reuseKey: ref.reuseKey,
            command: ref.command,
            cwd: ref.cwd,
            port: ref.port,
            url: ref.url,
            provider: ref.provider,
            providerRef: ref.providerRef,
            ownerAgentId: ref.ownerAgentId,
            startedByRunId: ref.startedByRunId,
            lastUsedAt: new Date(ref.lastUsedAt),
            startedAt,
            stoppedAt: ref.stoppedAt ? new Date(ref.stoppedAt) : null,
            stopPolicy: ref.stopPolicy,
            healthStatus: ref.healthStatus,
            createdAt,
            updatedAt: new Date(),
        })
            .onConflictDoUpdate({
            target: workspaceRuntimeServices.id,
            set: {
                projectId: ref.projectId,
                projectWorkspaceId: ref.projectWorkspaceId,
                executionWorkspaceId: ref.executionWorkspaceId,
                issueId: ref.issueId,
                scopeType: ref.scopeType,
                scopeId: ref.scopeId,
                serviceName: ref.serviceName,
                status: ref.status,
                lifecycle: ref.lifecycle,
                reuseKey: ref.reuseKey,
                command: ref.command,
                cwd: ref.cwd,
                port: ref.port,
                url: ref.url,
                provider: ref.provider,
                providerRef: ref.providerRef,
                ownerAgentId: ref.ownerAgentId,
                startedByRunId: ref.startedByRunId,
                lastUsedAt: new Date(ref.lastUsedAt),
                startedAt,
                stoppedAt: ref.stoppedAt ? new Date(ref.stoppedAt) : null,
                stopPolicy: ref.stopPolicy,
                healthStatus: ref.healthStatus,
                updatedAt: new Date(),
            },
        });
    }
    return refs;
}
export function buildWorkspaceReadyComment(input) {
    const lines = ["## Workspace Ready", ""];
    lines.push(`- Strategy: \`${input.workspace.strategy}\``);
    if (input.workspace.branchName)
        lines.push(`- Branch: \`${input.workspace.branchName}\``);
    lines.push(`- CWD: \`${input.workspace.cwd}\``);
    if (input.workspace.worktreePath && input.workspace.worktreePath !== input.workspace.cwd) {
        lines.push(`- Worktree: \`${input.workspace.worktreePath}\``);
    }
    for (const service of input.runtimeServices) {
        const detail = service.url ? `${service.serviceName}: ${service.url}` : `${service.serviceName}: running`;
        const suffix = service.reused ? " (reused)" : "";
        lines.push(`- Service: ${detail}${suffix}`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=workspace-runtime.js.map