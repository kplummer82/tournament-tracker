import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { LearnSeo } from "@/components/learn/LearnSeo";
import { PersonaBadge } from "@/components/learn/PersonaBadge";
import { ThemedImage } from "@/components/learn/ThemedImage";
import { SignupCta } from "@/components/learn/SignupCta";
import { GUIDES, PERSONA_LABELS, type LearnPersona } from "@/lib/learn/registry";
import { cn } from "@/lib/utils";

const PERSONAS = Object.keys(PERSONA_LABELS) as LearnPersona[];

export default function LearnHub() {
  const [persona, setPersona] = useState<LearnPersona | null>(null);

  const guides = [...GUIDES]
    .sort((a, b) => a.order - b.order)
    .filter((g) => (persona ? g.personas.includes(persona) : true));

  return (
    <div className="min-h-screen flex flex-col">
      <LearnSeo
        title="Guides"
        description="Learn Stacked Bench — guides for parents, coaches, league operators, and tournament organizers."
      />
      <Header />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 md:px-6 pt-12 pb-16">
        <p
          className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-4"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Guides &amp; Training
        </p>
        <h1
          className="text-[clamp(48px,7vw,92px)] leading-none mb-4"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Learn the game plan.
        </h1>
        <p className="text-base text-muted-foreground max-w-xl mb-10" style={{ fontFamily: "var(--font-body)" }}>
          Step-by-step guides with real screenshots — whether you&apos;re following your kid&apos;s team or running the
          whole league.
        </p>

        {/* Persona filter */}
        <div className="flex items-center gap-2 flex-wrap mb-8">
          <button
            type="button"
            onClick={() => setPersona(null)}
            className={cn(
              "inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] border transition-colors duration-100 cursor-pointer",
              persona === null
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            All guides
          </button>
          {PERSONAS.map((p) => (
            <PersonaBadge
              key={p}
              persona={p}
              active={persona === p}
              onClick={() => setPersona(persona === p ? null : p)}
            />
          ))}
        </div>

        {/* Guide grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {guides.map((g) => (
            <Link key={g.slug} href={`/learn/${g.slug}`} className="group">
              <Card className="h-full overflow-hidden transition-colors duration-100 group-hover:border-primary/50 py-0 gap-0">
                {g.heroImage && (
                  <div className="border-b border-border bg-elevated overflow-hidden">
                    <ThemedImage src={g.heroImage} alt="" className="w-full aspect-[16/9] object-cover object-top" />
                  </div>
                )}
                <CardContent className="p-5">
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {g.personas.slice(0, 2).map((p) => (
                      <PersonaBadge key={p} persona={p} />
                    ))}
                  </div>
                  <p
                    className="text-foreground text-lg font-semibold uppercase tracking-[0.03em] leading-tight mb-2 group-hover:text-primary transition-colors duration-100"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {g.title}
                  </p>
                  <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    {g.summary}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {guides.length === 0 && (
          <p className="text-sm text-muted-foreground py-10" style={{ fontFamily: "var(--font-body)" }}>
            No guides for this audience yet — more are on the way.
          </p>
        )}

        <SignupCta />
      </main>

      <footer className="border-t border-border py-5">
        <div className="mx-auto max-w-7xl px-4 md:px-6 flex items-center justify-between">
          <span
            className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Stacked Bench
          </span>
          <span
            className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Learn
          </span>
        </div>
      </footer>
    </div>
  );
}
