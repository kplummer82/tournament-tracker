import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

export type SeasonTabKey = "overview" | "teams" | "schedule" | "standings" | "playoffs" | "tiebreakers" | "scenarios";

const items: { key: SeasonTabKey; label: string; path: (id: number) => string }[] = [
  { key: "overview",    label: "Overview",    path: (id) => `/seasons/${id}/overview` },
  { key: "teams",       label: "Teams",       path: (id) => `/seasons/${id}/teams` },
  { key: "schedule",    label: "Schedule",    path: (id) => `/seasons/${id}/schedule` },
  { key: "standings",   label: "Standings",   path: (id) => `/seasons/${id}/standings` },
  { key: "playoffs",    label: "Playoffs",    path: (id) => `/seasons/${id}/playoffs` },
  { key: "tiebreakers", label: "Tiebreakers", path: (id) => `/seasons/${id}/tiebreakers` },
  { key: "scenarios",   label: "Scenarios",   path: (id) => `/seasons/${id}/scenarios` },
];

const NAV_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export function SeasonSidebarNav({ active, sid }: { active: SeasonTabKey; sid: number }) {
  const router = useRouter();
  const hrefs = useMemo(() => items.map((i) => i.path(sid)), [sid]);
  useEffect(() => { hrefs.forEach((h) => router.prefetch(h).catch(() => {})); }, [router, hrefs]);

  return (
    <nav className="flex flex-col py-4">
      {items.map((t) => {
        const href = t.path(sid);
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={href}
            prefetch
            scroll={false}
            onMouseEnter={() => router.prefetch(href).catch(() => {})}
            className={cn(
              "relative flex items-center h-9 px-4 transition-colors duration-100",
              isActive
                ? "text-foreground bg-elevated"
                : "text-muted-foreground hover:text-foreground hover:bg-elevated/50"
            )}
            style={NAV_STYLE}
          >
            {isActive && (
              <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
            )}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function SeasonTabsNav({ active, sid }: { active: SeasonTabKey; sid: number }) {
  const router = useRouter();
  const hrefs = useMemo(() => items.map((i) => i.path(sid)), [sid]);
  useEffect(() => { hrefs.forEach((h) => router.prefetch(h).catch(() => {})); }, [router, hrefs]);

  return (
    <div className="flex overflow-x-auto border-b border-border md:hidden">
      {items.map((t) => {
        const href = t.path(sid);
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={href}
            prefetch
            scroll={false}
            onMouseEnter={() => router.prefetch(href).catch(() => {})}
            className={cn(
              "relative shrink-0 h-10 px-4 flex items-center transition-colors duration-100",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            style={NAV_STYLE}
          >
            {t.label}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
