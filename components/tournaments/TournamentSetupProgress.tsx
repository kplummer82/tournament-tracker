// components/tournaments/TournamentSetupProgress.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { useTournament } from "./TournamentProvider";

export default function TournamentSetupProgress() {
  const { setupChecklist, setupPercent, setupReady, t, loading } = useTournament();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (loading || !t) return null;

  const complete = setupReady && setupPercent === 100;
  const fillColor = complete ? "#00c853" : "var(--primary)";
  const label = complete ? "Setup complete" : `${setupPercent}% setup`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 border border-border px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors duration-100"
        style={{ fontFamily: "var(--font-body)" }}
        title="Tournament setup progress"
      >
        <span
          className="relative inline-block h-1.5 w-24 overflow-hidden bg-border/70"
          aria-hidden
        >
          <span
            className="absolute inset-y-0 left-0 transition-[width] duration-200"
            style={{ width: `${setupPercent}%`, background: fillColor }}
          />
        </span>
        <span className="font-semibold tabular-nums" style={{ color: fillColor }}>
          {label}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-72 border border-border bg-card p-3 shadow-lg"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Tournament setup
          </p>
          <ul className="flex flex-col gap-1.5">
            {setupChecklist.map((item) => {
              const Icon = item.done ? Check : Circle;
              const content = (
                <span
                  className={`flex items-start gap-2 px-2 py-1.5 text-xs transition-colors duration-100 ${
                    item.href ? "hover:bg-elevated" : ""
                  }`}
                >
                  <Icon
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      item.done ? "text-[color:var(--badge-completed-text)]" : "text-muted-foreground"
                    }`}
                    strokeWidth={item.done ? 3 : 2}
                  />
                  <span className="flex-1">
                    <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
                      {item.label}
                    </span>
                    {item.detail && (
                      <span className="block text-[10px] text-muted-foreground">{item.detail}</span>
                    )}
                  </span>
                </span>
              );
              return (
                <li key={item.key}>
                  {item.href ? (
                    <Link href={item.href} onClick={() => setOpen(false)} className="block">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
