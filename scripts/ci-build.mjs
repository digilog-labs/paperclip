#!/usr/bin/env node
/**
 * Cloudtype (and similar) may run `pnpm install` before the full monorepo is COPY'd,
 * then `pnpm run build` after COPY — leaving workspace node_modules incomplete.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

/** Cloudtype/Docker often set NODE_ENV=production before install — skips @types/react. */
function run(command, env = process.env) {
  execSync(command, { stdio: "inherit", env });
}

function installAllDeps() {
  run("pnpm install --frozen-lockfile", {
    ...process.env,
    NODE_ENV: "development",
    npm_config_production: "false",
  });
}

const tsxCli = "cli/node_modules/tsx/dist/cli.mjs";
const hasReactTypes =
  existsSync("ui/node_modules/@types/react/package.json") ||
  existsSync("node_modules/@types/react/package.json");
const monorepoInstallIncomplete = !existsSync(tsxCli) || !hasReactTypes;

if (monorepoInstallIncomplete) {
  installAllDeps();
  run("pnpm run build:cloudtype");
} else {
  run("pnpm run preflight:workspace-links");
  run("pnpm -r build");
}
