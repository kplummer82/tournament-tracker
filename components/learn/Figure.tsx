"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { ThemedImage } from "./ThemedImage";

/**
 * Bordered screenshot with an uppercase micro-caption. Click to enlarge in a
 * full-screen lightbox (Escape or click closes). Src lives under /learn/ and
 * is the dark variant; a -light twin is shown in light mode unless `themed`
 * is false (for theme-neutral images like PDF pages).
 */
export function Figure({
  src,
  alt,
  caption,
  themed = true,
}: {
  src: string;
  alt: string;
  caption?: string;
  themed?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <figure className="my-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge screenshot: ${alt}`}
        className="relative block w-full border border-border bg-card overflow-hidden cursor-zoom-in group transition-colors duration-100 hover:border-primary/50"
      >
        {themed ? (
          <ThemedImage src={src} alt={alt} className="w-full" />
        ) : (
          <img src={src} alt={alt} className="w-full block" loading="lazy" />
        )}
        <span className="absolute bottom-2 right-2 flex items-center justify-center h-7 w-7 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-100">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </button>
      {caption && (
        <figcaption
          className="mt-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {caption}
        </figcaption>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 md:p-8 cursor-zoom-out"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close enlarged screenshot"
            className="absolute top-4 right-4 flex items-center justify-center h-9 w-9 border border-white/30 text-white hover:border-white hover:bg-white/10 transition-colors duration-100"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="max-w-[96vw] max-h-[88vh] border border-white/20" onClick={(e) => e.stopPropagation()}>
            {themed ? (
              <ThemedImage src={src} alt={alt} className="max-w-[96vw] max-h-[88vh] w-auto h-auto object-contain" />
            ) : (
              <img src={src} alt={alt} className="max-w-[96vw] max-h-[88vh] w-auto h-auto object-contain block" />
            )}
          </div>
          {caption && (
            <p
              className="text-[10px] uppercase tracking-[0.1em] text-white/70"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {caption}
            </p>
          )}
        </div>
      )}
    </figure>
  );
}
