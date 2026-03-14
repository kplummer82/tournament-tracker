import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Standalone auth proxy for Pages Router.
 * Forwards requests to Neon Auth without importing @neondatabase/auth/next/server,
 * which uses next/headers (App Router only) and causes ERR_MODULE_NOT_FOUND in Pages Router.
 */
function getOrigin(req: NextApiRequest): string {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  const origin = `${proto}://${host}`;
  // In dev, map LAN IPs to localhost so Neon Auth accepts the origin
  if (process.env.NODE_ENV !== "production" && !origin.includes("localhost")) {
    return "http://localhost:3000";
  }
  return origin;
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

  // In dev over HTTP, cookies are stored without __Secure- prefix.
  // Re-add the prefix when forwarding to Neon Auth upstream.
  let cookie = req.headers.cookie ?? "";
  if (process.env.NODE_ENV !== "production") {
    cookie = cookie.replace(
      /\bneon-auth\.session_token\b/g,
      "__Secure-neon-auth.session_token"
    );
  }

  const headers: Record<string, string> = {
    Origin: origin,
    Cookie: cookie,
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

    // Forward Set-Cookie headers — forEach can skip/combine them
    const rawSetCookies = response.headers.getSetCookie?.() ?? [];
    const realOrigin = `${(req.headers["x-forwarded-proto"] ?? "http")}://${req.headers.host ?? "localhost:3000"}`;
    const isLocalhost = realOrigin.includes("localhost") || realOrigin.includes("127.0.0.1") || realOrigin.includes("192.168.");
    const setCookies = rawSetCookies.map((c) => {
      // Always strip Domain — we're proxying, so cookies must be scoped to our own host
      let cookie = c.replace(/;\s*Domain=[^;]*/i, "");
      if (isLocalhost) {
        // Dev over HTTP: strip HTTPS-only attributes
        cookie = cookie
          .replace(/^__Secure-/i, "")        // strip __Secure- prefix (requires HTTPS)
          .replace(/;\s*Secure/i, "")         // strip Secure flag
          .replace(/;\s*Partitioned/i, "")    // strip Partitioned (requires Secure)
          .replace(/SameSite=None/i, "SameSite=Lax"); // None requires Secure
      }
      return cookie;
    });
    if (process.env.NODE_ENV !== "production") {
      console.log(`[auth proxy] ${path} — raw cookies:`, rawSetCookies);
      console.log(`[auth proxy] ${path} — rewritten cookies:`, setCookies);
    }
    if (setCookies.length > 0) {
      res.setHeader("Set-Cookie", setCookies);
    }

    const forwardHeaders = [
      "content-type", "content-length", "content-encoding", "date",
      "x-neon-ret-request-id", "set-auth-jwt", "set-auth-token"
    ];
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== "set-cookie" && forwardHeaders.includes(lower)) {
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
