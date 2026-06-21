// components/tournaments/TournamentShell.tsx
import Link from "next/link";
import Header from "@/components/Header";
import TabsNav, { SidebarNav } from "./TabsNav";
import { useTournament } from "./TournamentProvider";
import type { TabKey } from "./types";
import { Copy, Trash2, Save, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import FollowButton from "@/components/FollowButton";
import TournamentSetupProgress from "./TournamentSetupProgress";

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Active:    { bg: "#00c85318", text: "#00c853", border: "#00c85340" },
  Draft:     { bg: "#5a5a5a18", text: "#5a5a5a", border: "#5a5a5a40" },
  Completed: { bg: "var(--badge-completed-bg)", text: "var(--badge-completed-text)", border: "var(--badge-completed-border)" },
  Archived:  { bg: "#3a3a3a18", text: "#3a3a3a", border: "#3a3a3a40" },
};

const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function TournamentShell({
  tab,
  enableSave = false,
  children,
}: {
  tab: TabKey;
  enableSave?: boolean;
  children: React.ReactNode;
}) {
  const { tid, t, saving, save, remove, loading, error, canEdit } = useTournament();
  const sc = STATUS_COLORS[t?.tournamentstatus ?? ""] ?? STATUS_COLORS.Draft;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* ── Top bar ── */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 md:px-6 h-10 flex items-center justify-between gap-4">
          <Link
            href="/tournaments"
            className="flex items-center gap-1.5 shrink-0 whitespace-nowrap text-muted-foreground hover:text-foreground transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            <ArrowLeft className="h-3 w-3 shrink-0" />
            All Tournaments
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <div className="hidden md:block">
              <TournamentSetupProgress />
            </div>
            {tid && <FollowButton entityType="tournament" entityId={tid} />}
            {canEdit && (<>

              {tid && (
                <Link
                  href={`/tournaments?cloneFrom=${tid}`}
                  aria-label="Clone tournament"
                  className={cn(BTN_BASE, "shrink-0 border-border text-muted-foreground hover:text-foreground hover:border-border/80")}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <Copy className="h-3 w-3 shrink-0" />
                  <span className="hidden sm:inline">Clone</span>
                </Link>
              )}
              <button
                type="button"
                onClick={remove}
                aria-label="Delete tournament"
                className={cn(BTN_BASE, "shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10")}
                style={{ fontFamily: "var(--font-body)" }}
              >
                <Trash2 className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">Delete</span>
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!enableSave || saving}
                aria-label={saving ? "Saving changes" : "Save changes"}
                className={cn(BTN_BASE, "shrink-0 bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-30")}
                style={{ fontFamily: "var(--font-body)" }}
              >
                <Save className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">{saving ? "Saving…" : "Save"}</span>
              </button>
            </>)}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl w-full px-4 md:px-6 flex-1 flex flex-col">
        {/* ── Tournament header ── */}
        <div className="py-5 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="h-7 w-64 bg-elevated animate-pulse" />
              ) : (
                <h1
                  className="truncate"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "28px",
                    letterSpacing: "-0.02em",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  {t?.name ?? "Tournament"}
                </h1>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {t?.tournamentstatus && (
                  <span
                    className="badge"
                    style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
                  >
                    {t.tournamentstatus}
                  </span>
                )}
                {t?.division && (
                  <span
                    className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-2 py-0.5"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {t.division}
                  </span>
                )}
                {t?.bats?.map((b) => (
                  <span
                    key={b.id}
                    className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-2 py-0.5"
                    style={{ fontFamily: "var(--font-body)" }}
                    title="Bat"
                  >
                    {b.name}
                  </span>
                ))}
                {(t?.city || t?.state) && (
                  <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    {[t.city, t.state].filter(Boolean).join(", ")}
                    {t?.year ? ` · ${t.year}` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile tab strip ── */}
        {tid && <TabsNav active={tab} tid={tid} />}

        {/* ── Sidebar + content ── */}
        <div className="flex flex-1 gap-0 min-h-0">
          {/* Sidebar desktop */}
          {tid && (
            <aside className="hidden md:flex flex-col w-48 shrink-0 border-r border-border">
              <SidebarNav active={tab} tid={tid} />
            </aside>
          )}

          {/* Content */}
          <main className="flex-1 min-w-0 py-6 md:pl-7">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 bg-elevated animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" style={{ fontFamily: "var(--font-body)" }}>
                {error}
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
