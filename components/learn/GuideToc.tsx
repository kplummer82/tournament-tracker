import type { GuideSection } from "@/lib/learn/registry";

export function GuideToc({ sections }: { sections: GuideSection[] }) {
  if (sections.length === 0) return null;
  return (
    <nav aria-label="On this page">
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-3"
        style={{ fontFamily: "var(--font-body)" }}
      >
        On this page
      </p>
      <ul className="space-y-2 border-l border-border">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="flex items-baseline gap-2 pl-3 -ml-px border-l border-transparent text-sm text-muted-foreground hover:text-primary hover:border-primary transition-colors duration-100"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <span
                className="text-[11px] text-border shrink-0"
                style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
