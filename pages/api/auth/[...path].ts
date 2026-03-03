import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Standalone auth proxy for Pages Router.
 * Forwards requests to Neon Auth without importing @neondatabase/auth/next/server,
 * which uses next/headers (App Router only) and causes ERR_MODULE_NOT_FOUND in Pages Router.
 */
function getOrigin(req: NextApiRequest): string {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

const PROXY_HEADERS = ["user-agent", "authorization", "referer", "content-type"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pathSegments = req.query.path;
  const pathArray = Array.isArray(pathSegments) ? pathSegments : pathSegments ? [pathSegments] : [];
  const path = pathArray.join("/");
  if (!path) {
    return res.status(404).json({ error: "Not found" });
  }

  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) {
    console.error("[auth proxy] NEON_AUTH_BASE_URL is not set");
    return res.status(500).json({ error: "Auth not configured" });
  }

  const origin = getOrigin(req);
  const method = (req.method ?? "GET").toUpperCase();

  const upstreamUrl = new URL(`${baseUrl.replace(/\/$/, "")}/${path}`);
  if (req.url?.includes("?")) {
    const q = req.url.indexOf("?");
    upstreamUrl.search = req.url.slice(q);
  }

  const headers: Record<string, string> = {
    Origin: origin,
    Cookie: req.headers.cookie ?? "",
    "x-neon-auth-middleware": "true",
  };
  for (const key of PROXY_HEADERS) {
    const value = req.headers[key];
    if (value !== undefined && value !== null) {
      headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
    }
  }

  let body: string | undefined;
  if (method !== "GET" && req.body !== undefined && req.body !== null) {
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method,
      headers,
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      console.error("[auth proxy] upstream error", response.status, path, text);
    }

    res.status(response.status);
    const forwardHeaders = [
      "content-type", "content-length", "content-encoding", "date",
      "x-neon-ret-request-id", "set-auth-jwt", "set-auth-token"
    ];
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "set-cookie") {
        const setCookies = response.headers.getSetCookie?.() ?? [value];
        res.setHeader("Set-Cookie", setCookies);
      } else if (forwardHeaders.includes(lower)) {
        res.setHeader(key, value);
      }
    });

    if (text) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          return res.json(JSON.parse(text));
        } catch {
          return res.send(text);
        }
      }
      return res.send(text);
    }
    return res.end();
  } catch (err) {
    console.error("[auth proxy]", path, err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return res.status(500).json({ error: message });
  }
}
