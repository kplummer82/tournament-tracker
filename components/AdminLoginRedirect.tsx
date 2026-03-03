"use client";

import { useRouter } from "next/router";
import { useEffect } from "react";
import { authClient } from "@/lib/auth/client";

/**
 * When an admin signs in, login sends them to /?fromLogin=1.
 * This component redirects them to the admin area (/admin → /admin/users).
 */
export default function AdminLoginRedirect() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const isAdmin = user?.role === "admin";
  const fromLogin = router.query.fromLogin === "1";
  const onHome = router.pathname === "/";

  useEffect(() => {
    if (isPending || !onHome || !fromLogin) return;
    if (isAdmin) {
      router.replace("/admin");
    }
  }, [isPending, onHome, fromLogin, isAdmin, router]);

  return null;
}
