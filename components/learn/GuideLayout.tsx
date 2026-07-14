import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import Header from "@/components/Header";
import type { GuideEntry } from "@/lib/learn/registry";
import { LearnSeo } from "./LearnSeo";
import { GuideToc } from "./GuideToc";
import { PersonaBadge } from "./PersonaBadge";
import { SignupCta } from "./SignupCta";

export function GuideLayout({ guide }: { guide: GuideEntry }) {
  const { Component } = guide;
  return (
    <div className="min-h-screen flex flex-col">
      <LearnSeo title={guide.title} description={guide.summary} image={guide.heroImage} />
      <Header />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 md:px-6 pt-8 pb-16">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-8"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          All guides
        </Link>

        <div className="flex gap-12">
          <article className="min-w-0 flex-1 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {guide.personas.map((p) => (
                <PersonaBadge key={p} persona={p} />
              ))}
            </div>
            <h1
              className="text-[clamp(34px,5vw,54px)] leading-[0.95] mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {guide.title}
            </h1>
            <p className="text-base text-muted-foreground max-w-xl mb-2" style={{ fontFamily: "var(--font-body)" }}>
              {guide.summary}
            </p>
            <div className="flex items-center gap-4 mb-6">
              {guide.updated && (
                <p
                  className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Updated {guide.updated}
                </p>
              )}
              {guide.pdfHref && (
                <a
                  href={guide.pdfHref}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary hover:underline"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Download as PDF
                </a>
              )}
            </div>

            <Component />

            <SignupCta />
          </article>

          {guide.sections && guide.sections.length > 0 && (
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="sticky top-20">
                <GuideToc sections={guide.sections} />
              </div>
            </aside>
          )}
        </div>
      </main>

      <footer className="border-t border-border py-5">
        <div className="mx-auto max-w-7xl px-4 md:px-6 flex items-center justify-between">
          <span
            className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Stacked Bench
          </span>
          <Link
            href="/learn"
            className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/50 hover:text-primary transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Learn
          </Link>
        </div>
      </footer>
    </div>
  );
}
