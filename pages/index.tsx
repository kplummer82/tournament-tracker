import Header from "@/components/Header";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

type MinimalItem = { id: number; name: string };

export default function HomePage() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const [open, setOpen] = useState({ teams: true, leagues: true, tournaments: true });
  const toggle = (key: keyof typeof open) =>
    setOpen((p) => ({ ...p, [key]: !p[key] }));

  const [myTeams, setMyTeams]             = useState<MinimalItem[]>([]);
  const [myLeagues, setMyLeagues]         = useState<MinimalItem[]>([]);
  const [myTournaments, setMyTournaments] = useState<MinimalItem[]>([]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/teams?mine=true")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.rows)) setMyTeams(d.rows); })
      .catch(() => {});
    fetch("/api/leagues?mine=true")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.rows)) setMyLeagues(d.rows); })
      .catch(() => {});
    fetch("/api/tournaments?mine=true")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.rows)) setMyTournaments(d.rows); })
      .catch(() => {});
  }, [user]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col justify-center px-6 pt-20 pb-12 mx-auto max-w-7xl w-full">
        <div className="animate-fade-up">
          <p
            className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-6"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Youth Sports Management Platform
          </p>
          <h1
            className="text-[clamp(64px,10vw,140px)] leading-none text-muted-foreground/30 mb-0"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Leagues.
          </h1>
          <h1
            className="text-[clamp(64px,10vw,140px)] leading-none text-muted-foreground/30 -mt-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Tournaments.
          </h1>
          <h1
            className="text-[clamp(64px,10vw,140px)] leading-none text-foreground mb-8 -mt-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Stacked.
          </h1>
        </div>

        <div className="animate-fade-up-1 max-w-xl">
          <p
            className="text-muted-foreground mb-8 text-base"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Season schedules, live standings, tiebreaker rules, and bracket play — all in one place.
          </p>
        </div>
      </section>

      {/* ── How it works strip ────────────────────────────── */}
      <section className="border-t border-border animate-fade-up-2">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 divide-border">
            {[
              { num: "01", label: "Leagues & Seasons", desc: "Organize teams into leagues, divisions, and seasons." },
              { num: "02", label: "Standings",         desc: "Live standings with configurable tiebreaker rules." },
              { num: "03", label: "Brackets",          desc: "Seed from standings and run single-elimination playoffs." },
            ].map(({ num, label, desc }) => (
              <div key={num} className="flex gap-5 py-8 px-2 md:px-8 first:pl-0 last:pr-0">
                <span
                  className="text-[44px] leading-none text-border select-none shrink-0"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
                >
                  {num}
                </span>
                <div>
                  <p
                    className="text-foreground text-sm font-semibold uppercase tracking-[0.08em] mb-1"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {label}
                  </p>
                  <p className="text-muted-foreground text-sm" style={{ fontFamily: "var(--font-body)" }}>
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── My Teams / My Leagues / My Tournaments (logged-in) ── */}
      {user && (
        <section className="border-t border-border animate-fade-up-3">
          <div className="mx-auto max-w-7xl px-4 md:px-6 divide-y divide-border">
            {(
              [
                { key: "teams"       as const, label: "My Teams",       items: myTeams,       href: (id: number) => `/teams/${id}` },
                { key: "leagues"     as const, label: "My Leagues",     items: myLeagues,     href: (id: number) => `/leagues/${id}` },
                { key: "tournaments" as const, label: "My Tournaments", items: myTournaments, href: (id: number) => `/tournaments/${id}` },
              ]
            ).map(({ key, label, items, href }) => (
              <div key={key}>
                <button
                  onClick={() => toggle(key)}
                  className="flex items-center justify-between w-full py-4 -mx-3 px-3 hover:bg-elevated transition-colors duration-100 cursor-pointer select-none"
                >
                  <span
                    className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {label}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200${open[key] ? " rotate-180" : ""}`}
                  />
                </button>
                {open[key] && (
                  items.length === 0 ? (
                    <p
                      className="pb-6 text-sm text-muted-foreground"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      Nothing here yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1 pb-6">
                      {items.map((item) => (
                        <Link
                          key={item.id}
                          href={href(item.id)}
                          className="group py-2 border-b border-border/40 hover:border-primary/40 transition-colors duration-100"
                        >
                          <span
                            className="text-foreground group-hover:text-primary transition-colors duration-100 truncate block"
                            style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.02em" }}
                          >
                            {item.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-border py-5 mt-auto">
        <div className="mx-auto max-w-7xl px-4 md:px-6 flex items-center justify-between">
          <span
            className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Stacked Bench
          </span>
          <span
            className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Youth Sports
          </span>
        </div>
      </footer>
    </div>
  );
}
