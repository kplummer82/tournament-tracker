import type { NextApiResponse } from "next";

/**
 * Log the real error server-side and send a SAFE, generic message to the client.
 *
 * API routes must not return raw `err.message` to callers — Postgres/driver
 * errors can disclose schema, query, or internal detail (info disclosure). This
 * keeps the real error in the server logs (where a tracker like Sentry can hook
 * in later) while the client sees only `clientMessage`.
 *
 * Usage in a catch block:
 *   } catch (err) {
 *     return sendServerError(res, err, "invites:list");
 *   }
 *
 * Pass a `clientMessage` when a specific, non-sensitive message is useful to the
 * user (e.g. "Failed to load invites"); otherwise the generic default is used.
 */
export function sendServerError(
  res: NextApiResponse,
  err: unknown,
  context: string,
  clientMessage = "Something went wrong. Please try again.",
  status = 500
): void {
  console.error(`[${context}]`, err);
  res.status(status).json({ error: clientMessage });
}
