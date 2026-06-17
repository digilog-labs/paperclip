/**
 * AgentC remote update relay route.
 *
 * Receives update requests through the existing Paperclip tunnel (port 3100)
 * and forwards them to the agentc_updater sidecar over the internal Docker
 * network — without exposing the updater directly to the internet.
 *
 * POST /api/agentc/update
 *   Authorization: Bearer <PAPERCLIP_BOARD_API_KEY>
 *   → http://agentc_updater:8765/update  (internal network only)
 */

import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { forbidden } from "../errors.js";
import { assertBoard } from "./authz.js";

const UPDATER_URL =
  process.env.AGENTC_UPDATER_URL?.trim() || "http://agentc_updater:8765/update";
const UPDATE_SECRET_ENV = "UPDATE_SECRET";

function getUpdateSecret(): string | null {
  return process.env[UPDATE_SECRET_ENV]?.trim() || null;
}

function safeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function agentcUpdateRoutes() {
  const router = Router();

  router.post("/agentc/update", async (req, res) => {
    // Require Paperclip board session
    assertBoard(req);

    const secret = getUpdateSecret();
    if (!secret) {
      res.status(503).json({
        ok: false,
        error: "UPDATE_SECRET not configured on this node.",
      });
      return;
    }

    let updaterRes: Response;
    try {
      updaterRes = await fetch(UPDATER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify({ source: "paperclip-relay" }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        ok: false,
        error: `Cannot reach agentc_updater: ${detail}`,
        hint: "Ensure the agentc_updater container is running on the same Docker network.",
      });
      return;
    }

    let body: unknown;
    try {
      body = await updaterRes.json();
    } catch {
      body = null;
    }

    res.status(updaterRes.ok ? 200 : updaterRes.status).json(
      updaterRes.ok
        ? { ok: true, ...(typeof body === "object" && body !== null ? body : {}) }
        : { ok: false, status: updaterRes.status, detail: body },
    );
  });

  return router;
}
