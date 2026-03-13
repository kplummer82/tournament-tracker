import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/auth/requireSession";

function getOrigin(req: NextApiRequest): string {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const origin = getOrigin(req);
  const limit = typeof req.query.limit === "string" ? req.query.limit : "100";
  const offset = typeof req.query.offset === "string" ? req.query.offset : "0";
  const url = new URL(`${origin}/api/auth/admin/list-users`);
  url.searchParams.set("limit", limit);
  url.searchParams.set("offset", offset);

  try {
    const authRes = await fetch(url.toString(), {
      headers: { cookie: req.headers.cookie ?? "" },
    });
    const data = await authRes.json();
    if (!authRes.ok) {
      return res.status(authRes.status).json(data);
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("[admin users list]", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
