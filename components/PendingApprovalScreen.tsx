"use client";

import { authClient } from "@/lib/auth/client";

/**
 * The single, canonical "your account is pending admin approval" screen.
 *
 * Rendered in TWO places that must stay identical: by AuthGate whenever a
 * signed-in user is still inactive (the "navigate back later" view), and by
 * /welcome/pending immediately after signup. Keeping one component guarantees
 * the message a pending user sees right after signing up matches what they see
 * on every subsequent visit. The copy is deliberately truthful about the
 * follow-up email — an admin approval now actually sends one (see
 * lib/auth/activation.ts).
 */
export default function PendingApprovalScreen({ email }: { email?: string }) {
  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-6">
          <svg
            className="w-8 h-8 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1
          className="mb-2"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "28px",
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
          }}
        >
          Pending Approval
        </h1>
        <p
          className="text-muted-foreground mb-8"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Your account has been created but is awaiting administrator approval.
          We&apos;ll email you{email ? ` at ${email}` : ""} as soon as an admin
          approves your account.
        </p>
        <button
          onClick={handleSignOut}
          className="bg-muted text-foreground px-6 py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-80 transition-opacity duration-100 border border-border"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
