#!/usr/bin/env node
/**
 * Cloudtype runtime: expects prebuilt artifacts committed via `pnpm run build:deploy:git`.
 * No Vite/tsc on the server — avoids OOM on small instances.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const entry = "server/dist/index.js";
const ui = "server/ui-dist/index.html";

function run(command, env = process.env) {
  execSync(command, { stdio: "inherit", env });
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

const tsxLoader = existsSync("node_modules/tsx/dist/loader.mjs")
  ? "./node_modules/tsx/dist/loader.mjs"
  : "./server/node_modules/tsx/dist/loader.mjs";

run(`node --import ${tsxLoader} ${entry}`, {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "production",
});
