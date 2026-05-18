#!/usr/bin/env node
/**
 * Cloudtype Node template may run start without shipping build artifacts (no server/dist).
 * Install + build once if the compiled server entry is missing, then run it.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const entry = "server/dist/index.js";

function run(command, env = process.env) {
  execSync(command, { stdio: "inherit", env });
}

if (!existsSync(entry)) {
  console.log(`[cloudtype-start] ${entry} missing — pnpm install + build:cloudtype`);
  run("pnpm install --frozen-lockfile", {
    ...process.env,
    NODE_ENV: "development",
    npm_config_production: "false",
  });
  run("pnpm run build:cloudtype", process.env);
}

if (!existsSync(entry)) {
  console.error(`[cloudtype-start] build failed: ${entry} still missing`);
  process.exit(1);
}

run(`node ${entry}`, { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "production" });
