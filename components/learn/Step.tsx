import type { ReactNode } from "react";

/** Numbered guide step; `id` doubles as the TOC anchor. */
export function Step({
  num,
  id,
  title,
  children,
}: {
  num: number;
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 flex gap-5 md:gap-7 py-8 border-t border-border first:border-t-0">
      <span
        className="text-[44px] leading-none text-border select-none shrink-0 w-14 text-right"
        style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
      >
        {String(num).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <h2
          className="text-foreground text-lg font-semibold uppercase tracking-[0.04em] mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
        <div className="space-y-4 text-[15px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          {children}
        </div>
      </div>
    </section>
  );
}
