#!/usr/bin/env node
/**
 * Cloudtype (and similar) may run `pnpm install` before the full monorepo is COPY'd,
 * then `pnpm run build` after COPY — leaving workspace node_modules incomplete.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function run(command) {
  execSync(command, { stdio: "inherit", env: process.env });
}

const tsxCli = "cli/node_modules/tsx/dist/cli.mjs";
const monorepoInstallIncomplete = !existsSync(tsxCli);

if (monorepoInstallIncomplete) {
  run("pnpm install --frozen-lockfile");
  run("pnpm run build:cloudtype");
} else {
  run("pnpm run preflight:workspace-links");
  run("pnpm -r build");
}
