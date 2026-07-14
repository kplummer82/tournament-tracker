"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Card, CardContent } from "@/components/ui/card";

/** End-of-guide sign-up prompt; hidden for signed-in users. */
export function SignupCta() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending || session?.user) return null;

  return (
    <Card className="mt-10">
      <CardContent className="p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-5 justify-between">
        <div>
          <p
            className="text-foreground text-lg font-semibold uppercase tracking-[0.04em] mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Ready to run your season here?
          </p>
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Stacked Bench is free to try — create an account and follow your first team in under a minute.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/sign-up"
            className="bg-primary text-primary-foreground px-6 py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 transition-opacity duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="px-4 py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground hover:text-primary transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
