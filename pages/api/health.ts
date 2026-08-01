import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

// Public, unauthenticated liveness/readiness probe for external uptime monitors
// (see middleware.ts allowlist). Checks that the database is reachable and
// answers within a bounded time, so a hung DB fails fast as 503 instead of
// hanging until the function timeout. Returns no internal error detail.
const DB_TIMEOUT_MS = 5000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ status: "error", error: "Method not allowed" });
  }

  const startedAt = Date.now();
  try {
    await Promise.race([
      sql`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db_timeout")), DB_TIMEOUT_MS)
      ),
    ]);
    return res.status(200).json({
      status: "ok",
      db: "up",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[health] db check failed", err);
    return res.status(503).json({
      status: "error",
      db: "down",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }
}
