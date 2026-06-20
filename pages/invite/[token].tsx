"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

const ROLE_LABELS: Record<string, string> = {
  league_admin: "League Admin",
  division_admin: "Division Admin",
  tournament_admin: "Tournament Admin",
  team_manager: "Coach / Manager",
  team_parent: "Team Parent",
};

type Peek = {
  intent?: string;
  email: string;
  role: string;
  scope: { type: string; id: number };
  scopeLabel: string;
  invitedBy: { name: string | null };
};

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "logged_out"; peek: Peek }
  | { kind: "match"; peek: Peek }
  | { kind: "mismatch"; peek: Peek; sessionEmail: string };

export default function InvitePage() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const token = router.query.token;
    if (typeof token !== "string" || token.length === 0) {
      setView({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invites/peek?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (!cancelled) setView({ kind: "invalid" });
          return;
        }
        const peek = (await res.json()) as Peek;
        if (cancelled) return;

        let sessionEmail: string | null = null;
        try {
          const session = await authClient.getSession();
          sessionEmail = session?.data?.user?.email ?? null;
        } catch {
          /* treat as logged out */
        }
        if (cancelled) return;

        if (!sessionEmail) {
          setView({ kind: "logged_out", peek });
        } else if (sessionEmail.toLowerCase() === peek.email.toLowerCase()) {
          setView({ kind: "match", peek });
        } else {
          setView({ kind: "mismatch", peek, sessionEmail });
        }
      } catch {
        if (!cancelled) setView({ kind: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.token]);

  const handleAccept = async () => {
    const token = router.query.token;
    if (typeof token !== "string") return;
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to accept invitation");
      window.location.href = data.redirect || "/";
    } catch (e: any) {
      setError(e.message);
      setAccepting(false);
    }
  };

  const token = typeof router.query.token === "string" ? router.query.token : "";

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-md border border-border bg-card p-8">
        <div className="mb-6">
          <span
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
          </span>
        </div>

        {view.kind === "loading" && (
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Loading invitation…
          </p>
        )}

        {view.kind === "invalid" && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "-0.02em" }}>
              Invitation unavailable
            </h1>
            <p className="text-sm text-muted-foreground mb-6" style={{ fontFamily: "var(--font-body)" }}>
              This invitation is invalid, has already been used, or has expired.
            </p>
            <Link href="/" className="text-primary text-sm hover:opacity-80" style={{ fontFamily: "var(--font-body)" }}>
              Go to homepage
            </Link>
          </>
        )}

        {(view.kind === "logged_out" || view.kind === "match" || view.kind === "mismatch") && (
          <>
            <h1 className="text-xl font-bold mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "-0.02em" }}>
              You&apos;re invited
            </h1>
            <p className="text-sm text-muted-foreground mb-5" style={{ fontFamily: "var(--font-body)" }}>
              {view.peek.invitedBy.name ? `${view.peek.invitedBy.name} invited you` : "You have been invited"} to join{" "}
              <span className="text-foreground font-semibold">{view.peek.scopeLabel}</span> as{" "}
              <span className="text-foreground font-semibold">{ROLE_LABELS[view.peek.role] ?? view.peek.role}</span>.
            </p>

            {error && (
              <p className="text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2 mb-4" style={{ fontFamily: "var(--font-body)" }}>
                {error}
              </p>
            )}

            {view.kind === "match" && (
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="w-full bg-primary text-primary-foreground py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 disabled:opacity-40 transition-opacity"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {accepting ? "Accepting…" : "Accept invitation"}
              </button>
            )}

            {view.kind === "logged_out" && (
              <div className="space-y-3">
                <Link
                  href={`/sign-up?invite=${encodeURIComponent(token)}`}
                  className="block w-full text-center bg-primary text-primary-foreground py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 transition-opacity"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Create account &amp; accept
                </Link>
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
                  className="block w-full text-center border border-border py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase text-foreground hover:border-primary hover:text-primary transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  I already have an account — sign in
                </Link>
                <p className="text-xs text-muted-foreground text-center" style={{ fontFamily: "var(--font-body)" }}>
                  This invitation was sent to <span className="text-foreground">{view.peek.email}</span>.
                </p>
              </div>
            )}

            {view.kind === "mismatch" && (
              <div className="space-y-3">
                <p className="text-sm" style={{ fontFamily: "var(--font-body)", color: "var(--badge-completed-text)" }}>
                  This invitation was sent to <span className="font-semibold">{view.peek.email}</span>, but you&apos;re
                  signed in as <span className="font-semibold">{view.sessionEmail}</span>. Sign out and sign in with the
                  invited account to accept.
                </p>
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
                  className="block w-full text-center border border-border py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase text-foreground hover:border-primary hover:text-primary transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Switch account
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
