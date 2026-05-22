import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserStatus } from "@/lib/auth/profile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  // Same posture as /api/me/signup-intent: inactive users must still be
  // able to read their status, so we do not call requireSession.
  const session = await getSessionForRequest(req);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const status = await getUserStatus(session.user.id);
  return res.status(200).json({ status });
}
