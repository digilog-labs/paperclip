#!/usr/bin/env node
/**
 * Cloudtype runtime: prebuilt server/dist + server/ui-dist in git; install deps if needed.
 * Do NOT run pnpm db:migrate here — drift DBs fail with "already exists". Sync journal locally first.
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

function validateCloudtypeEnv(env) {
  const host = (env.HOST ?? "127.0.0.1").trim();
  const bind = env.PAPERCLIP_BIND?.trim();
  const mode = (env.PAPERCLIP_DEPLOYMENT_MODE ?? "local_trusted").trim();
  const publicBind =
    host === "0.0.0.0" || host === "::" || bind === "lan";

  if (publicBind && mode === "local_trusted") {
    console.error(
      "[cloudtype-start] HOST=0.0.0.0 cannot run with local_trusted (loopback only).\n" +
        "  Set Cloudtype runtime env:\n" +
        "    PAPERCLIP_DEPLOYMENT_MODE=authenticated\n" +
        "    PAPERCLIP_DEPLOYMENT_EXPOSURE=private\n" +
        "    PAPERCLIP_PUBLIC_URL=https://<your-cloudtype-host>\n" +
        "  See docs/digiloglabs/cloudtype-deploy.md",
    );
    process.exit(1);
  }

  if (mode === "authenticated" && !env.PAPERCLIP_PUBLIC_URL?.trim()) {
    console.warn(
      "[cloudtype-start] PAPERCLIP_PUBLIC_URL is unset — set it to your Cloudtype HTTPS URL",
    );
  }
}

function logDatabaseTarget() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("[cloudtype-start] DATABASE_URL is not set — server will use embedded Postgres");
    return;
  }
  try {
    const u = new URL(url);
    console.log(
      `[cloudtype-start] DATABASE_URL host=${u.hostname} db=${u.pathname.replace(/^\//, "")} user=${u.username}`,
    );
  } catch {
    console.log("[cloudtype-start] DATABASE_URL is set (non-URL format)");
  }
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

logDatabaseTarget();
validateCloudtypeEnv(process.env);

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

const tsxLoader = existsSync("node_modules/tsx/dist/loader.mjs")
  ? "./node_modules/tsx/dist/loader.mjs"
  : "./server/node_modules/tsx/dist/loader.mjs";

run(`node --import ${tsxLoader} ${entry}`, {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "production",
});
