"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/",               label: "Home",            key: "home" },
  { href: "/tournaments",    label: "Tournaments",     key: "tournaments" },
  { href: "/leagues",        label: "Leagues",         key: "leagues" },
  { href: "/teams",          label: "Teams",           key: "teams" },
  { href: "/bracket-builder",label: "Bracket Builder", key: "bracket-builder" },
] as const;

function UserSquare({ name, email }: { name?: string | null; email?: string | null }) {
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : email
      ? email[0].toUpperCase()
      : "?";
  return (
    <div className="h-7 w-7 flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold"
         style={{ fontFamily: "var(--font-display)", letterSpacing: "0.02em" }}>
      {initials}
    </div>
  );
}

export default function Header() {
  const { pathname } = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const isAdmin = user?.role === "admin";
  const [menuOpen, setMenuOpen] = useState(false);

  const current =
    pathname.startsWith("/tournaments")     ? "tournaments" :
    pathname.startsWith("/leagues")         ? "leagues" :
    pathname.startsWith("/seasons")         ? "leagues" :
    pathname.startsWith("/teams")           ? "teams" :
    pathname.startsWith("/bracket-builder") ? "bracket-builder" :
    "home";

  return (
    <header className="w-full sticky top-0 z-50 bg-card border-b border-border">
      <div className="mx-auto max-w-7xl px-4 md:px-6 h-12 flex items-center justify-between gap-8">

        {/* Brand */}
        <Link
          href="/"
          className="shrink-0 text-foreground hover:text-primary transition-colors duration-100"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em", textTransform: "uppercase" }}
        >
          Tournament Tracker
        </Link>

        {/* Nav — desktop only */}
        <nav className="hidden md:flex items-center gap-0">
          {NAV_LINKS.map(({ href, label, key }) => {
            const isActive = current === key;
            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  "relative px-4 h-12 flex items-center text-[11px] font-medium transition-colors duration-100",
                  "tracking-[0.1em] uppercase",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                style={{ fontFamily: "var(--font-body)" }}
              >
                {label}
                {isActive && (
                  <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Auth — desktop only */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {isPending ? (
            <div className="h-7 w-7 bg-border animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link
                  href="/admin"
                  className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground hover:text-primary transition-colors duration-100"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Admin
                </Link>
              )}
              <button
                type="button"
                onClick={async () => { await authClient.signOut(); window.location.href = "/"; }}
                className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-100"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Sign out
              </button>
              <UserSquare name={user.name} email={user.email} />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-100"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity duration-100"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Sign up
              </Link>
            </div>
          )}
        </div>

        {/* Hamburger — mobile only */}
        <button
          type="button"
          className="md:hidden flex items-center justify-center h-10 w-10 text-foreground"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
          />

          {/* Menu panel */}
          <div className="absolute top-0 right-0 w-72 max-w-[85vw] h-full bg-card border-l border-border flex flex-col">
            {/* Close button */}
            <div className="flex items-center justify-between h-12 px-4 border-b border-border">
              {user && (
                <div className="flex items-center gap-2">
                  <UserSquare name={user.name} email={user.email} />
                  <span
                    className="text-xs text-foreground truncate max-w-[140px]"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {user.name || user.email}
                  </span>
                </div>
              )}
              <button
                type="button"
                className="flex items-center justify-center h-10 w-10 text-muted-foreground hover:text-foreground ml-auto"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-2">
              {NAV_LINKS.map(({ href, label, key }) => {
                const isActive = current === key;
                return (
                  <Link
                    key={key}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center px-5 py-3 text-sm font-medium transition-colors duration-100",
                      "tracking-[0.06em] uppercase",
                      isActive
                        ? "text-primary bg-primary/5 border-l-2 border-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-elevated"
                    )}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {label}
                  </Link>
                );
              })}

              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center px-5 py-3 text-sm font-medium tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground hover:bg-elevated border-t border-border mt-2"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Admin
                </Link>
              )}
            </nav>

            {/* Auth actions */}
            <div className="border-t border-border px-5 py-4">
              {isPending ? (
                <div className="h-10 bg-border animate-pulse" />
              ) : user ? (
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    await authClient.signOut();
                    window.location.href = "/";
                  }}
                  className="w-full text-left py-2 text-sm font-medium tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-100"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Sign out
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="py-2 text-sm font-medium tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-100"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setMenuOpen(false)}
                    className="bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold tracking-[0.06em] uppercase text-center hover:opacity-90 transition-opacity duration-100"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
