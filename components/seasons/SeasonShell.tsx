import Link from "next/link";
import Header from "@/components/Header";
import SeasonTabsNav, { SeasonSidebarNav } from "./SeasonTabsNav";
import { useSeason } from "./SeasonProvider";
import type { SeasonTabKey } from "./SeasonTabsNav";
import { Trash2, Save, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: "#5a5a5a18", text: "#888",    border: "#5a5a5a40" },
  active:    { bg: "#00c85318", text: "#00c853", border: "#00c85340" },
  playoffs:  { bg: "#ff8c0018", text: "#ff8c00", border: "#ff8c0040" },
  completed: { bg: "#ffe50018", text: "#ffe500", border: "#ffe50040" },
  archived:  { bg: "#3a3a3a18", text: "#5a5a5a", border: "#3a3a3a40" },
};

const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function SeasonShell({
  tab,
  enableSave = false,
  children,
}: {
  tab: SeasonTabKey;
  enableSave?: boolean;
  children: React.ReactNode;
}) {
  const { seasonId, season, saving, save, remove, loading, error } = useSeason();
  const sc = STATUS_COLORS[season?.status ?? "draft"] ?? STATUS_COLORS.draft;

  const backHref = season
    ? `/leagues/${season.league_id}/seasons/${season.year}-${season.season_type}`
    : "/leagues";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 md:px-6 h-10 flex items-center justify-between gap-4">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            <ArrowLeft className="h-3 w-3" />
            {season ? `${season.league_abbreviation ?? season.league_name} · ${season.year} ${season.season_type.charAt(0).toUpperCase() + season.season_type.slice(1)}` : "Leagues"}
          </Link>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={remove}
              className={cn(BTN_BASE, "border-destructive/40 text-destructive hover:bg-destructive/10")}
              style={{ fontFamily: "var(--font-body)" }}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!enableSave || saving}
              className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-30")}
              style={{ fontFamily: "var(--font-body)" }}
            >
              <Save className="h-3 w-3" />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl w-full px-4 md:px-6 flex-1 flex flex-col">
        {/* Season header */}
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
                  {season?.name ?? "Season"}
                </h1>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {season?.status && (
                  <span className="badge" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                    {season.status}
                  </span>
                )}
                {season?.division_name && (
                  <span
                    className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-2 py-0.5"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {season.division_name}
                    {season.division_age_range ? ` · ${season.division_age_range}` : ""}
                  </span>
                )}
                {season?.league_name && (
                  <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    {season.league_name}
                    {season.governing_body_name ? ` · ${season.governing_body_name}` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile tab strip */}
        {seasonId && <SeasonTabsNav active={tab} sid={seasonId} />}

        {/* Sidebar + content */}
        <div className="flex flex-1 gap-0 min-h-0">
          {/* Sidebar desktop */}
          {seasonId && (
            <aside className="hidden md:flex flex-col w-48 shrink-0 border-r border-border">
              <SeasonSidebarNav active={tab} sid={seasonId} />
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
