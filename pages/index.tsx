import Header from "@/components/Header";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

type RecentTournament = {
  id: number;
  name: string;
  city?: string;
  state?: string;
  year?: number;
  status?: string;
};

const STATUS_COLORS: Record<string, string> = {
  Active:    "#00c853",
  Draft:     "#5a5a5a",
  Completed: "#ffe500",
  Archived:  "#3a3a3a",
};

export default function HomePage() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [recent, setRecent] = useState<RecentTournament[]>([]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/tournaments?pageSize=5")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.rows)) setRecent(d.rows.slice(0, 5)); })
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
            Youth Sports Tournament Management
          </p>
          <h1
            className="text-[clamp(64px,10vw,140px)] leading-none text-muted-foreground/30 mb-0"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Track Every
          </h1>
          <h1
            className="text-[clamp(64px,10vw,140px)] leading-none text-foreground mb-8 -mt-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Tournament.
          </h1>
        </div>

        <div className="animate-fade-up-1 max-w-xl">
          <p
            className="text-muted-foreground mb-8 text-base"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Pool play scheduling, live standings, tiebreaker rules, and bracket assignment — all in one place.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/tournaments"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 transition-opacity duration-100"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Browse Tournaments
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/teams"
              className="inline-flex items-center gap-2 border border-foreground/30 text-foreground px-6 py-3 text-[11px] font-semibold tracking-[0.1em] uppercase hover:border-foreground transition-colors duration-100"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Manage Teams
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works strip ────────────────────────────── */}
      <section className="border-t border-border animate-fade-up-2">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {[
              { num: "01", label: "Pool Play",    desc: "Schedule round-robin games, enter scores, track wins." },
              { num: "02", label: "Standings",    desc: "Configurable tiebreakers rank teams automatically." },
              { num: "03", label: "Bracket Play", desc: "Build brackets, seed from standings, run knockout rounds." },
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

      {/* ── Recent tournaments (logged-in) ────────────────── */}
      {user && recent.length > 0 && (
        <section className="border-t border-border animate-fade-up-3">
          <div className="mx-auto max-w-7xl px-4 md:px-6 py-8">
            <div className="flex items-center justify-between mb-4">
              <span
                className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Recent Tournaments
              </span>
              <Link
                href="/tournaments"
                className="text-[11px] tracking-[0.08em] uppercase text-primary hover:opacity-80 transition-opacity duration-100 flex items-center gap-1"
                style={{ fontFamily: "var(--font-body)" }}
              >
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {recent.map((t) => (
                <Link
                  key={t.id}
                  href={`/tournaments/${t.id}`}
                  className="flex items-center justify-between py-3 group hover:bg-elevated transition-colors duration-100 -mx-3 px-3"
                >
                  <span
                    className="text-foreground group-hover:text-primary transition-colors duration-100"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "-0.01em" }}
                  >
                    {t.name}
                  </span>
                  <div className="flex items-center gap-4">
                    {(t.city || t.state) && (
                      <span className="text-xs text-muted-foreground hidden sm:block" style={{ fontFamily: "var(--font-body)" }}>
                        {[t.city, t.state].filter(Boolean).join(", ")}
                        {t.year ? ` · ${t.year}` : ""}
                      </span>
                    )}
                    {t.status && (
                      <span
                        className="badge"
                        style={{
                          background: `${STATUS_COLORS[t.status] ?? "#5a5a5a"}20`,
                          color: STATUS_COLORS[t.status] ?? "#5a5a5a",
                          borderColor: `${STATUS_COLORS[t.status] ?? "#5a5a5a"}40`,
                        }}
                      >
                        {t.status}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
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
            Tournament Tracker
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
