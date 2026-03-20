import type { NextApiRequest, NextApiResponse } from "next";
import { isApprovalRequired, isUserInactive } from "@/lib/auth/requireSession";
import { getSessionForRequest } from "@/lib/auth/server";

/**
 * Public endpoint — returns whether user approval mode is active
 * and (if a session exists) whether the current user is pending approval.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const requireApproval = await isApprovalRequired();
    let userPending = false;

    if (requireApproval) {
      const session = await getSessionForRequest(req).catch(() => null);
      if (session?.user?.id) {
        userPending = await isUserInactive(session.user.id);
      }
    }

    return res.status(200).json({ requireApproval, userPending });
  } catch (err) {
    console.error("[approval-status]", err);
    return res.status(200).json({ requireApproval: false, userPending: false });
  }
}
