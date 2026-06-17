/**
 * agentc-updater — lightweight HTTP sidecar for remote Docker image updates.
 *
 * Listens on :8765 (internal Docker network only — never exposed externally).
 * Accepts POST /update with Bearer token auth, then:
 *   1. docker pull restnfeel/agentc-node:latest
 *   2. docker compose up -d --no-deps paperclip
 *
 * Environment variables:
 *   UPDATE_SECRET   Required. Bearer token that callers must present.
 *   IMAGE           Image to pull (default: restnfeel/agentc-node:latest)
 *   COMPOSE_FILE    Path to docker-compose.yml (default: /agentc-node/docker-compose.yml)
 *   SERVICE_NAME    Compose service to restart (default: paperclip)
 *   PORT            Listen port (default: 8765)
 */

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PORT = parseInt(process.env.PORT ?? "8765", 10);
const UPDATE_SECRET = process.env.UPDATE_SECRET?.trim() ?? "";
const IMAGE = process.env.IMAGE?.trim() || "restnfeel/agentc-node:latest";
const COMPOSE_FILE = process.env.COMPOSE_FILE?.trim() || "/agentc-node/docker-compose.yml";
const SERVICE_NAME = process.env.SERVICE_NAME?.trim() || "paperclip";

if (!UPDATE_SECRET) {
  console.error("[agentc-updater] FATAL: UPDATE_SECRET is not set");
  process.exit(1);
}

function safeEquals(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function extractBearer(req) {
  const auth = req.headers["authorization"] ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function runUpdate() {
  const steps = [];

  // Step 1: docker pull
  console.log(`[agentc-updater] Pulling ${IMAGE}...`);
  const pull = await execFileAsync("docker", ["pull", IMAGE], { timeout: 300_000 }).catch((e) => ({ error: e.message, stdout: e.stdout ?? "", stderr: e.stderr ?? "" }));
  if ("error" in pull) {
    steps.push({ step: "pull", ok: false, error: pull.error });
    return { ok: false, steps };
  }
  steps.push({ step: "pull", ok: true, image: IMAGE });
  console.log(`[agentc-updater] Pull complete.`);

  // Step 2: docker compose up -d --no-deps <service>
  console.log(`[agentc-updater] Restarting service "${SERVICE_NAME}"...`);
  const up = await execFileAsync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "up", "-d", "--no-deps", SERVICE_NAME],
    { timeout: 120_000 }
  ).catch((e) => ({ error: e.message, stdout: e.stdout ?? "", stderr: e.stderr ?? "" }));

  if ("error" in up) {
    steps.push({ step: "compose_up", ok: false, error: up.error });
    return { ok: false, steps };
  }
  steps.push({ step: "compose_up", ok: true, service: SERVICE_NAME });
  console.log(`[agentc-updater] Service restarted.`);

  return { ok: true, image: IMAGE, steps };
}

let updating = false;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  // Health probe
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, image: IMAGE }));
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/update") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
    return;
  }

  // Auth
  const token = extractBearer(req);
  if (!token || !safeEquals(token, UPDATE_SECRET)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
    return;
  }

  // Prevent concurrent updates
  if (updating) {
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Update already in progress" }));
    return;
  }

  updating = true;
  res.writeHead(200, { "Content-Type": "application/json" });

  try {
    const result = await runUpdate();
    res.end(JSON.stringify(result));
  } catch (err) {
    res.end(JSON.stringify({ ok: false, error: err.message }));
  } finally {
    updating = false;
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[agentc-updater] Listening on :${PORT} (image=${IMAGE})`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
