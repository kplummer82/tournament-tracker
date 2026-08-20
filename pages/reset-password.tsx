"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const INPUT_STYLE =
  "w-full border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set when the server rejects the token — retrying the same token is
  // pointless, so the page flips into the invalid-link state.
  const [tokenDead, setTokenDead] = useState(false);

  // This page is statically optimized, so the query is empty during SSR but can
  // be populated on the client's very first render. Branching straight off
  // router.isReady therefore hydrates a different tree than the server sent.
  // Hold the spinner until after mount so both renders agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && router.isReady;

  const token = typeof router.query.token === "string" ? router.query.token : null;
  const linkInvalid =
    tokenDead || (ready && (router.query.error === "INVALID_TOKEN" || !token));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    // Raw fetch instead of authClient: the Neon adapter's customFetchImpl
    // throws away the error body's `code` on non-2xx responses.
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "INVALID_TOKEN") {
          setTokenDead(true);
        } else if (data.code === "PASSWORD_TOO_SHORT") {
          setError("Password must be at least 8 characters.");
        } else if (data.code === "PASSWORD_TOO_LONG") {
          setError("Password is too long (128 characters max).");
        } else {
          setError("Couldn't reset your password. Try again.");
        }
        setLoading(false);
        return;
      }
      window.location.href = "/login?reset=1";
    } catch {
      setError("Couldn't reset your password. Try again.");
      setLoading(false);
    }
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
          New password
        </h1>
        <p className="text-sm text-muted-foreground mb-8" style={{ fontFamily: "var(--font-body)" }}>
          Choose a new password for your account.
        </p>

        {!ready ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : linkInvalid ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
              This reset link is invalid or has expired.
            </p>
            <Link
              href="/forgot-password"
              className="block w-full bg-primary text-primary-foreground py-2.5 text-center text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 transition-opacity duration-100"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-section mb-1.5 block">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus
                maxLength={128}
                className={INPUT_STYLE}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="label-section mb-1.5 block">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                maxLength={128}
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
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
