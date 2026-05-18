#!/usr/bin/env node
import { cpSync, existsSync, rmSync } from "node:fs";

const src = "ui/dist";
const dest = "server/ui-dist";

if (!existsSync(`${src}/index.html`)) {
  console.error(`[copy-ui-dist] missing ${src}/index.html — run UI build first`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-ui-dist] ${src} -> ${dest}`);
