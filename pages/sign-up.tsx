"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import type { SignupIntent } from "@/lib/auth/permissions";
import { postSignupRedirect } from "@/lib/auth/postSignupRedirect";
import { IntentPicker } from "@/components/signup/IntentPicker";
import { CredentialsForm } from "@/components/signup/CredentialsForm";

type InvitePayload = {
  intent: SignupIntent;
  email?: string;
};

export default function SignUpPage() {
  const router = useRouter();
  const [intent, setIntent] = useState<SignupIntent | null>(null);
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, if there's an ?invite=<token> param, try to peek.
  // F2 ships with the peek stub returning 404 for all tokens, so this
  // gracefully falls through to the normal stage-1 flow.
  // Also clear any leftover signup-in-progress flag from a previous attempt.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("signup-in-progress");
    }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const token = router.query.invite;
    if (typeof token !== "string" || token.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invites/peek?token=${encodeURIComponent(token)}`);
        if (!res.ok) return; // 404 = no invite, fall through
        if (cancelled) return;
        const data = (await res.json()) as Partial<InvitePayload>;
        if (cancelled) return;
        if (data?.intent) {
          setInvite({ intent: data.intent, email: data.email });
          setIntent(data.intent);
        }
      } catch {
        // ignore — fall through to normal flow
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.invite]);

  const handleSubmit = async ({
    name,
    email,
    password,
  }: {
    name: string;
    email: string;
    password: string;
  }) => {
    if (!intent) return; // guarded by the form being mounted only after intent set
    setError(null);
    setLoading(true);

    // Tell AuthGate not to redirect us away from /sign-up the instant the
    // session cookie is set — its useSession() re-renders the layout
    // before our intent-write/status-read/redirect chain completes.
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("signup-in-progress", "1");
    }

    let clientError: string | null = null;
    try {
      const res = await authClient.signUp.email({ name, email, password });
      if (res.error) clientError = res.error.message ?? "Sign up failed";
    } catch (err) {
      clientError = err instanceof Error ? err.message : "Sign up failed";
    }

    // Verify session — sign-up may auto-login even if client reports error
    let userId: string | null = null;
    try {
      const session = await authClient.getSession();
      userId = session?.data?.user?.id ?? null;
    } catch {
      /* fall through */
    }

    if (!userId) {
      if (!clientError) {
        // Sign-up succeeded but no auto-login (approval mode without auto-session).
        window.location.href = "/login?registered=1";
        return;
      }
      setError(clientError);
      setLoading(false);
      return;
    }

    // Write intent. If this fails, we still want to land the user somewhere
    // useful — postSignupRedirect handles null intent.
    let effectiveIntent: SignupIntent | null = intent;
    try {
      const res = await fetch("/api/me/signup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ intent }),
      });
      if (!res.ok) effectiveIntent = null;
    } catch {
      effectiveIntent = null;
    }

    // Read status so we can route inactive users correctly.
    let status: "active" | "inactive" = "active";
    try {
      const res = await fetch("/api/me/profile-status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data?.status === "inactive") status = "inactive";
      }
    } catch {
      /* default to active */
    }

    const target = postSignupRedirect(effectiveIntent, status);
    window.location.href = target;
  };

  const showPicker = !intent;

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
          <span
            className="text-muted-foreground/40 text-[10px] tracking-[0.12em] uppercase"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Youth Sports Management Platform
          </span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col justify-center px-8 md:px-14 py-12">
        {/* Mobile brand */}
        <div className="mb-10 lg:hidden">
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

        {showPicker ? (
          <IntentPicker onPick={setIntent} />
        ) : (
          <CredentialsForm
            key={invite?.email ?? "no-invite"}
            intent={intent!}
            prefilledEmail={invite?.email}
            onChangeIntent={() => setIntent(null)}
            onSubmit={handleSubmit}
            loading={loading}
            error={error}
          />
        )}

        <p
          className="mt-6 text-sm text-muted-foreground text-center"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:opacity-80 transition-opacity duration-100">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
