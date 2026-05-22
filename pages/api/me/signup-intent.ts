import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserSignupIntent, setUserSignupIntent } from "@/lib/auth/profile";
import { isValidSignupIntent } from "@/lib/auth/permissions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // We intentionally do NOT use requireSession here — that function rejects
  // inactive users. A brand-new inactive user must still be able to record
  // their signup intent (we'll route them to /welcome/pending).
  const session = await getSessionForRequest(req);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "GET") {
    const intent = await getUserSignupIntent(session.user.id);
    return res.status(200).json({ intent });
  }

  if (req.method === "POST") {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const intent = body.intent;
    if (!isValidSignupIntent(intent)) {
      return res
        .status(400)
        .json({ error: "intent must be one of: follower, coach, league_operator, tournament_organizer" });
    }
    try {
      await setUserSignupIntent(session.user.id, intent);
      return res.status(200).json({ intent });
    } catch (err) {
      console.error("[me/signup-intent] write failed", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method Not Allowed" });
}
