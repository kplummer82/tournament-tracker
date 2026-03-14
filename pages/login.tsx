"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

const INPUT_STYLE =
  "w-full border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

const QUOTES = [
  "Champions are made in the hours when everyone else is sleeping.",
  "Every great team starts with one game at a time.",
  "The scoreboard doesn't lie.",
  "Victory is the intersection of preparation and opportunity.",
];
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(QUOTES[0]);

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  const registered = router.query.registered === "1";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) { setError(res.error.message ?? "Sign in failed"); return; }
      const callback =
        typeof router.query.callbackUrl === "string" &&
        router.query.callbackUrl.startsWith("/") &&
        !router.query.callbackUrl.startsWith("//")
          ? router.query.callbackUrl
          : null;
      router.push(callback ?? "/?fromLogin=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left branding panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 bg-card border-r border-border p-12"
        style={{ maxWidth: "55%" }}
      >
        <div>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "16px",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              color: "var(--primary)",
            }}
          >
            Stacked Bench
          </Link>
        </div>

        <div>
          <p
            className="text-muted-foreground/40 mb-4"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            &ldquo;
          </p>
          <blockquote
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(28px, 3vw, 44px)",
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              color: "var(--foreground)",
            }}
          >
            {quote}
          </blockquote>
        </div>

        <div className="flex items-end gap-6">
          <div className="w-12 h-1 bg-primary" />
          <span
            className="text-muted-foreground/40 text-[10px] tracking-[0.12em] uppercase"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Youth Sports Management Platform
          </span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col justify-center px-6 md:px-14 py-6 md:py-12 max-w-lg lg:max-w-none">
        {/* Mobile brand */}
        <div className="mb-6 md:mb-10 lg:hidden">
          <Link
            href="/"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "var(--primary)" }}
          >
            Stacked Bench
          </Link>
        </div>

        <div className="max-w-sm w-full mx-auto">
          <h1
            className="mb-1"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "32px", textTransform: "uppercase", letterSpacing: "-0.02em" }}
          >
            Sign In
          </h1>
          <p className="text-sm text-muted-foreground mb-8" style={{ fontFamily: "var(--font-body)" }}>
            Welcome back. Enter your credentials to continue.
          </p>

          {registered && (
            <p className="mb-5 text-sm text-success border border-success/30 bg-success/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
              Account created. Sign in below.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-section mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={INPUT_STYLE}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label-section mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={INPUT_STYLE}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 disabled:opacity-40 transition-opacity duration-100 mt-2"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground text-center" style={{ fontFamily: "var(--font-body)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className="text-primary hover:opacity-80 transition-opacity duration-100">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
