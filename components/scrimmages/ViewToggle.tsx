"use client";

import React from "react";
import { List, Map as MapIcon } from "lucide-react";

export type ScrimmageView = "list" | "map";

type Props = {
  value: ScrimmageView;
  onChange: (next: ScrimmageView) => void;
};

const BTN_BASE =
  "h-9 px-3 flex items-center gap-1.5 text-[11px] tracking-[0.08em] uppercase transition-colors";

export default function ViewToggle({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Result view"
      className="inline-flex border border-border bg-card"
      style={{ fontFamily: "var(--font-body)" }}
    >
      <button
        type="button"
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
        className={
          BTN_BASE +
          (value === "list"
            ? " bg-primary text-primary-foreground"
            : " text-muted-foreground hover:text-primary")
        }
      >
        <List className="h-3.5 w-3.5" />
        List
      </button>
      <button
        type="button"
        aria-pressed={value === "map"}
        onClick={() => onChange("map")}
        className={
          BTN_BASE +
          " border-l border-border" +
          (value === "map"
            ? " bg-primary text-primary-foreground"
            : " text-muted-foreground hover:text-primary")
        }
      >
        <MapIcon className="h-3.5 w-3.5" />
        Map
      </button>
    </div>
  );
}
