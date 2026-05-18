#!/usr/bin/env node
/**
 * Cloudtype runtime: prebuilt server/dist + server/ui-dist in git; install deps if needed.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const entry = "server/dist/index.js";
const ui = "server/ui-dist/index.html";

const installEnv = {
  ...process.env,
  CI: "true",
  NODE_ENV: "development",
  npm_config_production: "false",
  PNPM_CONFIG_CONFIRM_MODULES_PURGE: "false",
};

function run(command, env = process.env) {
  execSync(command, { stdio: "inherit", env });
}

function workspaceDepsInstalled() {
  if (existsSync("server/node_modules/drizzle-orm")) return true;
  if (existsSync("node_modules/drizzle-orm")) return true;
  try {
    const pnpmDir = "node_modules/.pnpm";
    if (existsSync(pnpmDir)) {
      return readdirSync(pnpmDir).some((name) => name.startsWith("drizzle-orm@"));
    }
  } catch {
    // ignore
  }
  return false;
}

if (!existsSync(entry) || !existsSync(ui)) {
  console.error(
    "[cloudtype-start] Missing prebuilt deploy artifacts.\n" +
      "  On your PC: pnpm run build:deploy:git\n" +
      "  Then commit: server/dist server/ui-dist packages/plugins/sdk/dist\n" +
      "  See docs/digiloglabs/cloudtype-deploy.md",
  );
  process.exit(1);
}

if (!workspaceDepsInstalled()) {
  console.log(
    "[cloudtype-start] installing monorepo dependencies (pnpm, ~1–2 min on first boot)...",
  );
  run("pnpm install --frozen-lockfile", installEnv);
}

if (!workspaceDepsInstalled()) {
  console.error(
    "[cloudtype-start] drizzle-orm still missing after pnpm install.\n" +
      "  Set Cloudtype build install to: pnpm install --frozen-lockfile",
  );
  process.exit(1);
}

if (process.env.DATABASE_URL) {
  console.log("[cloudtype-start] checking database migrations (pnpm db:migrate)...");
  run("pnpm db:migrate", installEnv);
}

const tsxLoader = existsSync("node_modules/tsx/dist/loader.mjs")
  ? "./node_modules/tsx/dist/loader.mjs"
  : "./server/node_modules/tsx/dist/loader.mjs";

run(`node --import ${tsxLoader} ${entry}`, {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "production",
});
