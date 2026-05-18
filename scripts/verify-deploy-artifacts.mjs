#!/usr/bin/env node
import { existsSync } from "node:fs";

const required = ["server/dist/index.js", "server/ui-dist/index.html"];

for (const path of required) {
  if (!existsSync(path)) {
    console.error(`[build:deploy:git] missing ${path}`);
    process.exit(1);
  }
}

console.log("[build:deploy:git] artifacts OK");
