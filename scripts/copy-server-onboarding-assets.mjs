#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const src = "server/src/onboarding-assets";
const dest = "server/dist/onboarding-assets";

if (!existsSync(src)) {
  console.warn("[copy-server-onboarding-assets] no source dir, skip");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-server-onboarding-assets] ${path.normalize(src)} -> ${path.normalize(dest)}`);
