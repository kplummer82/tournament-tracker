"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { authClient } from "@/lib/auth/client";
import PendingApprovalScreen from "@/components/PendingApprovalScreen";

// Auth pages bounce already-signed-in users away (to "/").
const AUTH_PAGES = new Set(["/login", "/sign-up"]);
// Public marketing/training pages render for everyone, signed in or out.
const PUBLIC_PAGES = new Set(["/", "/learn"]);
const PUBLIC_PAGE_PREFIXES = ["/learn/"];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [userPending, setUserPending] = useState<boolean | null>(null);
  const [mfaRequired, setMfaRequired] = useState<boolean | null>(null);
  const redirectingRef = useRef(false);

  // Fetch per-user pending + MFA status whenever session changes (login/signup)
  const userId = session?.user?.id;
  useEffect(() => {
    if (isPending) return; // wait for session to resolve
    fetch("/api/auth/approval-status", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUserPending(d.userPending ?? false))
      .catch(() => setUserPending(false));
    if (!userId) {
      setMfaRequired(false);
      return;
    }
    fetch("/api/mfa/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { verificationRequired: false }))
      .then((d) => setMfaRequired(d.verificationRequired ?? false))
      .catch(() => setMfaRequired(false));
  }, [userId, isPending]);

  // Reset redirect guard when route changes
  useEffect(() => {
    redirectingRef.current = false;
  }, [router.pathname]);

  // --- Invite landing page ---
  // Accessible to everyone: logged-out invitees choose "create account / sign in"
  // and logged-in users accept. The page handles its own session logic, so we
  // must NOT redirect either way (unlike /login & /sign-up below, which bounce
  // logged-in users to /).
  if (router.pathname.startsWith("/invite/")) {
    return <>{children}</>;
  }

  // --- Public marketing/training pages ---
  // Signed-out visitors (and static generation, where the session is pending)
  // get the content immediately — no spinner, so SSG emits real HTML.
  // Signed-in users keep the pending-approval and MFA treatments; a brief
  // content flash while those statuses resolve is acceptable because the API
  // layer enforces both regardless.
  if (
    PUBLIC_PAGES.has(router.pathname) ||
    PUBLIC_PAGE_PREFIXES.some((p) => router.pathname.startsWith(p))
  ) {
    if (isPending || !session?.user) return <>{children}</>;
    if (userPending) return <PendingApprovalScreen email={session.user.email ?? undefined} />;
    if (mfaRequired && router.pathname !== "/mfa/verify") {
      if (!redirectingRef.current) {
        redirectingRef.current = true;
        router.replace(`/mfa/verify?callbackUrl=${encodeURIComponent(router.asPath)}`);
      }
      return null;
    }
    return <>{children}</>;
  }

  // --- Auth pages (login / sign-up) ---
  if (AUTH_PAGES.has(router.pathname)) {
    // Redirect logged-in users away from login/sign-up — but NOT when a
    // signup is mid-flight, because the sign-up page's own handler does
    // post-signup routing (intent write, status read, persona-specific
    // landing). AuthGate racing us here causes the user to land on /
    // instead of the persona target.
    const signupInProgress =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem("signup-in-progress") === "1";
    // Same race on /login: its handler decides between the callback and
    // /mfa/verify after the session cookie lands.
    const loginInProgress =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem("login-in-progress") === "1";
    if (
      !isPending &&
      session?.user &&
      !redirectingRef.current &&
      !signupInProgress &&
      !loginInProgress
    ) {
      redirectingRef.current = true;
      router.replace("/");
      return null;
    }
    return <>{children}</>;
  }

  // --- Loading state ---
  if (isPending || userPending === null || mfaRequired === null) {
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
    return <PendingApprovalScreen email={session.user.email ?? undefined} />;
  }

  // --- MFA: sessions that still owe a second factor ---
  // Covers deep links and stale tabs; the API layer enforces regardless.
  if (mfaRequired && router.pathname !== "/mfa/verify") {
    if (!redirectingRef.current) {
      redirectingRef.current = true;
      router.replace(`/mfa/verify?callbackUrl=${encodeURIComponent(router.asPath)}`);
    }
    return null;
  }

  // --- Authenticated & approved ---
  return <>{children}</>;
}
