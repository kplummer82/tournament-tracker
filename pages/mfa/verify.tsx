"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

const INPUT_STYLE =
  "w-full border border-border bg-input px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function MfaVerifyPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const bootRef = useRef(false);

  const callback =
    typeof router.query.callbackUrl === "string" &&
    router.query.callbackUrl.startsWith("/") &&
    !router.query.callbackUrl.startsWith("//")
      ? router.query.callbackUrl
      : "/";

  const finish = useCallback(
    (destination: string) => {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("login-in-progress");
      }
      window.location.href = destination;
    },
    []
  );

  const sendChallenge = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ purpose: "login" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCooldown(data.resendCooldownSeconds ?? 60);
        setError(null);
        setInfo("Code sent — check your email.");
        return;
      }
      if (data.code === "not_required") {
        finish(callback);
        return;
      }
      if (data.code === "resend_cooldown") {
        setCooldown(data.retryAfterSeconds ?? 60);
        setInfo("A code was already sent — check your email.");
        return;
      }
      if (data.code === "too_many_requests") {
        setError("Too many codes requested. Wait a while, then try again.");
        return;
      }
      if (data.code === "email_send_failed") {
        setError("We couldn't send the code email. Try resending in a moment.");
        return;
      }
      setError(data.error ?? "Failed to send the code. Try resending.");
    } catch {
      setError("Failed to send the code. Try resending.");
    }
  }, [callback, finish]);

  // On mount: confirm this session actually owes a code, then send one.
  // bootRef guards React strict-mode double-invocation (double emails).
  useEffect(() => {
    if (!router.isReady || bootRef.current) return;
    bootRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/mfa/status", { credentials: "include" });
        if (!res.ok) {
          finish(`/login?callbackUrl=${encodeURIComponent(callback)}`);
          return;
        }
        const status = await res.json();
        if (!status.verificationRequired) {
          finish(callback);
          return;
        }
        await sendChallenge();
        setReady(true);
      } catch {
        setError("Something went wrong. Try resending the code.");
        setReady(true);
      }
    })();
  }, [router.isReady, callback, finish, sendChallenge]);

  // Resend-cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ purpose: "login", code, trustDevice }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.code === "not_required") {
        finish(callback);
        return;
      }
      if (data.code === "invalid_code") {
        const n = data.attemptsRemaining;
        setError(
          n != null
            ? `That code isn't right. ${n} attempt${n === 1 ? "" : "s"} remaining.`
            : "That code isn't right."
        );
      } else if (data.code === "code_expired") {
        setError("That code has expired. Resend a new one below.");
      } else if (data.code === "too_many_attempts") {
        setError("Too many incorrect attempts. Resend a new code below.");
      } else {
        setError(data.error ?? "Verification failed. Try again.");
      }
      setCode("");
    } catch {
      setError("Verification failed. Try again.");
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("login-in-progress");
    }
    window.location.href = "/login";
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
          Check your email
        </h1>
        <p className="text-sm text-muted-foreground mb-8" style={{ fontFamily: "var(--font-body)" }}>
          {session?.user?.email
            ? <>We sent a 6-digit verification code to <span className="text-foreground">{session.user.email}</span>.</>
            : "We sent a 6-digit verification code to your email."}
        </p>

        {!ready ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-section mb-1.5 block">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                className={`${INPUT_STYLE} text-center text-2xl tracking-[0.5em]`}
                placeholder="000000"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer" style={{ fontFamily: "var(--font-body)" }}>
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="accent-[var(--primary)]"
              />
              Remember this device for 30 days
            </label>

            {info && !error && (
              <p className="text-sm text-success border border-success/30 bg-success/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
                {info}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-primary text-primary-foreground py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 disabled:opacity-40 transition-opacity duration-100 mt-2"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {loading ? "Verifying…" : "Verify"}
            </button>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={cooldown > 0}
                onClick={() => {
                  setInfo(null);
                  void sendChallenge();
                }}
                className="text-sm text-primary hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-100"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-100"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Sign in as someone else
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
