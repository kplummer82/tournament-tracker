import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Stub for the invite peek endpoint. Real implementation belongs to gap X1.
 *
 * Contract defined here so the signup page's invite branch can be wired up:
 *
 *   GET /api/invites/peek?token=<token>
 *
 * 200 response shape (when X1 ships):
 *   {
 *     intent: SignupIntent,
 *     email?: string,
 *     role?: AppRole,
 *     scope?: { type: ScopeType; id: number },
 *     invitedBy?: { name: string }
 *   }
 *
 * 404 for any unknown / missing / expired token. The signup page treats
 * 404 as "no invite — show the picker normally".
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  // Always 404 in F2. X1 will replace with real token lookup.
  return res.status(404).json({ error: "Invite not found" });
}
