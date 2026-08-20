"use client";

import { useState } from "react";
import Link from "next/link";

const INPUT_STYLE =
  "w-full border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Raw fetch instead of authClient: the Neon adapter's customFetchImpl
    // throws away the error body's `code` on non-2xx responses.
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
      if (!res.ok) {
        setError("Couldn't send the reset email. Try again.");
      } else {
        // Always the same generic notice — never reveal whether the
        // account exists.
        setSent(true);
      }
    } catch {
      setError("Couldn't send the reset email. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-sm w-full">
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

        <h1
          className="mt-8 mb-1"
          style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "32px", textTransform: "uppercase", letterSpacing: "-0.02em" }}
        >
          Reset password
        </h1>
        <p className="text-sm text-muted-foreground mb-8" style={{ fontFamily: "var(--font-body)" }}>
          Enter your account email and we&apos;ll send you a reset link. If you
          signed up with Google, use Sign in with Google instead.
        </p>

        {sent ? (
          <p className="text-sm text-success border border-success/30 bg-success/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
            If an account exists for that email, we sent a password reset link.
            Check your inbox.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-section mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className={INPUT_STYLE}
                placeholder="you@example.com"
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
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-muted-foreground text-center" style={{ fontFamily: "var(--font-body)" }}>
          Remembered it?{" "}
          <Link href="/login" className="text-primary hover:opacity-80 transition-opacity duration-100">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
