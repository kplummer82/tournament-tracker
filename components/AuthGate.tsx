"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { authClient } from "@/lib/auth/client";

const PUBLIC_PAGES = new Set(["/login", "/sign-up"]);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [userPending, setUserPending] = useState<boolean | null>(null);
  const redirectingRef = useRef(false);

  // Fetch per-user pending status whenever session changes (login/signup)
  const userId = session?.user?.id;
  useEffect(() => {
    if (isPending) return; // wait for session to resolve
    fetch("/api/auth/approval-status", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUserPending(d.userPending ?? false))
      .catch(() => setUserPending(false));
  }, [userId, isPending]);

  // Reset redirect guard when route changes
  useEffect(() => {
    redirectingRef.current = false;
  }, [router.pathname]);

  // --- Public pages ---
  if (PUBLIC_PAGES.has(router.pathname)) {
    // Redirect logged-in users away from login/sign-up
    if (!isPending && session?.user && !redirectingRef.current) {
      redirectingRef.current = true;
      router.replace("/");
      return null;
    }
    return <>{children}</>;
  }

  // --- Loading state ---
  if (isPending || userPending === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // --- No valid session ---
  if (!session?.user) {
    if (!redirectingRef.current) {
      redirectingRef.current = true;
      router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
    }
    return null;
  }

  // --- Approval mode: pending users ---
  if (userPending) {
    return <PendingApprovalScreen />;
  }

  // --- Authenticated & approved ---
  return <>{children}</>;
}

function PendingApprovalScreen() {
  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-6"
        >
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
          You&apos;ll have full access once an admin reviews your account.
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
