import type { NextApiRequest, NextApiResponse } from "next";
import { isApprovalRequired } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";

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

    // Do NOT forward content-length or content-encoding: fetch() already
    // decompresses the body, so forwarding these causes the browser to
    // misinterpret the (already decoded) payload.
    const forwardHeaders = [
      "content-type", "date",
      "x-neon-ret-request-id", "set-auth-jwt", "set-auth-token"
    ];
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== "set-cookie" && forwardHeaders.includes(lower)) {
        res.setHeader(key, value);
      }
    });

    // --- Track every signup in user_profiles ---
    // Neon Auth defaults role="user" which we can't change. Instead, track
    // user status in our own DB. When approval mode is on, new users start
    // as 'inactive' and must be approved by an admin.
    if (
      response.ok &&
      path.startsWith("sign-up") &&
      method === "POST"
    ) {
      try {
        const parsed = JSON.parse(text);
        const userData = parsed?.data ?? parsed;
        const userId = userData?.user?.id;
        if (userId) {
          const approvalRequired = await isApprovalRequired();
          const status = approvalRequired ? "inactive" : "active";
          await sql`INSERT INTO user_profiles (user_id, status) VALUES (${userId}, ${status}) ON CONFLICT (user_id) DO NOTHING`;
          console.log(`[auth proxy] created user_profile for ${userId} with status=${status}`);
        }
      } catch (e) {
        // Don't break signup if profile creation fails
        console.error("[auth proxy] error creating user profile on signup:", e);
      }
    }

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
