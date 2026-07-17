"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Map as MapboxMap } from "mapbox-gl";
import { cn } from "@/lib/utils";

/**
 * Chrome around an imperatively-created mapbox-gl map: renders the container
 * div the caller mounts its Map into, plus a desktop-only expand button that
 * takes the map to the full viewport.
 *
 * The container div stays at a fixed position in the React tree and only its
 * classes change — it is never moved, portaled, or conditionally rendered.
 * Callers create their Map once in a `[]`-dep effect, so remounting this
 * subtree would leave their mapRef pointing at a detached node and the map
 * would render blank. Keep the DOM shape constant; toggle classes only.
 */
type Props = {
  /** Attached to the div mapbox mounts into. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The caller's live Map, so the shell can re-measure it on toggle. */
  mapRef: React.RefObject<MapboxMap | null>;
  /** Accessible name for the map, also shown in the fullscreen toolbar. */
  label: string;
  /** Optional note under the map; becomes a footer strip in fullscreen. */
  caption?: React.ReactNode;
};

export default function MapFullscreenShell({
  containerRef,
  mapRef,
  label,
  caption,
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const expandBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
    // Deferred so the trigger has remounted and re-attached its ref.
    setTimeout(() => expandBtnRef.current?.focus(), 0);
  }, []);

  // mapbox-gl 3.x has no ResizeObserver — trackResize only watches `window` —
  // so a container that resizes on its own must be re-measured by hand.
  //
  // Order is load-bearing: locking body overflow removes the scrollbar and
  // widens the viewport without firing a resize event. Doing it here, before
  // resize(), is why this is a layout effect and not a plain one — otherwise
  // resize() measures the pre-lock width and leaves a gap down the right edge.
  //
  // For the same reason the wrapper must never transition its size or position:
  // resize() reads getBoundingClientRect() during layout and would catch the
  // animation's starting geometry.
  useLayoutEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    mapRef.current?.resize();
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFullscreen, mapRef]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFullscreen();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen, closeFullscreen]);

  useEffect(() => {
    if (isFullscreen) closeBtnRef.current?.focus();
  }, [isFullscreen]);

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[100] flex flex-col bg-background"
          : "space-y-2"
      }
      {...(isFullscreen
        ? { role: "dialog", "aria-modal": true, "aria-label": `${label}, fullscreen` }
        : {})}
    >
      {/* Always mounted so the container never changes siblings. */}
      <div
        className={cn(
          "shrink-0 items-center justify-between gap-2 h-11 px-3 border-b border-border/60 bg-card",
          isFullscreen ? "flex" : "hidden"
        )}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {label}
        </span>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={closeFullscreen}
          aria-label="Exit fullscreen"
          title="Exit fullscreen (Esc)"
          className="inline-flex items-center gap-1.5 h-8 px-3 border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors duration-100"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Minimize2 className="h-3.5 w-3.5" />
          Exit
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          aria-label={label}
          className={cn(
            "w-full bg-card",
            isFullscreen ? "h-full" : "h-[500px] border border-border"
          )}
        />
        {/* Trailing sibling — safe to render conditionally. Top-left is the only
            corner mapbox leaves free (nav controls, logo, attribution take the
            rest); z-10 clears the controls' z-index: 2. */}
        {!isFullscreen && (
          <button
            ref={expandBtnRef}
            type="button"
            onClick={() => setIsFullscreen(true)}
            aria-label="Expand map to fullscreen"
            title="Expand map"
            className="absolute top-2 left-2 z-10 hidden md:flex items-center justify-center h-8 w-8 border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors duration-100"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {caption && (
        <div
          className={cn(
            isFullscreen && "shrink-0 border-t border-border/60 bg-card px-3 py-2"
          )}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
