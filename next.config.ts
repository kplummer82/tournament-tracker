import type { NextConfig } from "next";

// Security headers applied to every response. These are all safe to enforce
// (they don't block any resource the app loads).
//
// NOTE ON CSP: a Content-Security-Policy is intentionally NOT enforced here yet.
// The app loads Mapbox GL (blob: web workers), runs an inline anti-FOUC theme
// script in _document.tsx, and relies on Next.js inline bootstrap — a wrong CSP
// would break maps or the whole page. CSP should be introduced in Report-Only
// mode with a report endpoint first, tuned against real violations, then
// enforced. Tracked as a follow-up.
const securityHeaders = [
  // Force HTTPS for two years, including subdomains. Safe: the site is
  // HTTPS-only on Vercel.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disallow being framed anywhere — clickjacking protection.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers from MIME-sniffing responses away from the declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin on cross-origin navigations; full path same-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop access to powerful features the app doesn't use. Geolocation stays
  // enabled for same-origin (Mapbox "locate me" control).
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Type errors fail the build. Re-enabled after confirming `tsc --noEmit` is
  // clean — this restores the compiler as a real pre-deploy gate.
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        // Apply to every route.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
