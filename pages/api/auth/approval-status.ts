import type { NextApiRequest, NextApiResponse } from "next";
import { isApprovalRequired } from "@/lib/auth/requireSession";

/**
 * Public endpoint — returns whether user approval mode is active.
 * No auth required (AuthGate needs this before it knows the user's role).
 */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const requireApproval = await isApprovalRequired();
    return res.status(200).json({ requireApproval });
  } catch (err) {
    console.error("[approval-status]", err);
    return res.status(200).json({ requireApproval: false });
  }
}
