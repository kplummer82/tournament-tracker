"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

const INPUT_STYLE =
  "w-full border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.signUp.email({ name, email, password });
      if (res.error) { setError(res.error.message ?? "Sign up failed"); return; }
      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
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
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "var(--primary)" }}
          >
            Stacked Bench
          </Link>
        </div>

        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "clamp(48px, 5vw, 80px)",
              textTransform: "uppercase",
              letterSpacing: "-0.03em",
              lineHeight: 0.95,
              color: "var(--foreground)",
            }}
          >
            Run Your<br />Tournament<br />
            <span style={{ color: "var(--primary)" }}>Right.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-base max-w-sm" style={{ fontFamily: "var(--font-body)" }}>
            Pool play, standings, bracket seeding — all tracked in one place. Free to use.
          </p>
        </div>

        <div className="flex gap-6 items-center">
          <div className="w-12 h-1 bg-primary" />
          <span className="text-muted-foreground/40 text-[10px] tracking-[0.12em] uppercase" style={{ fontFamily: "var(--font-body)" }}>
            Youth Sports Management Platform
          </span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col justify-center px-8 md:px-14 py-12">
        {/* Mobile brand */}
        <div className="mb-10 lg:hidden">
          <Link href="/" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "var(--primary)" }}>
            Stacked Bench
          </Link>
        </div>

        <div className="max-w-sm w-full mx-auto">
          <h1
            className="mb-1"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "32px", textTransform: "uppercase", letterSpacing: "-0.02em" }}
          >
            Create Account
          </h1>
          <p className="text-sm text-muted-foreground mb-8" style={{ fontFamily: "var(--font-body)" }}>
            Get started — it only takes a minute.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-section mb-1.5 block">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className={INPUT_STYLE}
                placeholder="Your full name"
              />
            </div>
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
                autoComplete="new-password"
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
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground text-center" style={{ fontFamily: "var(--font-body)" }}>
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:opacity-80 transition-opacity duration-100">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
