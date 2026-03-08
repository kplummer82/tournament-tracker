// pages/seasons/[seasonid]/overview.tsx
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";

const SEASON_TYPES = ["spring", "summer", "fall", "winter"] as const;
const STATUSES = ["draft", "active", "playoffs", "completed", "archived"] as const;

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

const SECTION_HEADER_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "13px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted-foreground)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-section">{label}</label>
      {children}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="pb-2 mb-4 border-b border-border">
      <span style={SECTION_HEADER_STYLE}>{label}</span>
    </div>
  );
}

function OverviewForm() {
  const { season, setSeason } = useSeason();
  if (!season) return null;

  return (
    <div className="space-y-7 max-w-2xl">
      <section>
        <SectionHeader label="Basic Information" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Season name">
              <input
                className={INPUT}
                value={season.name}
                onChange={(e) => setSeason((p) => p ? { ...p, name: e.target.value } : p)}
                placeholder="e.g. 2025 Spring Season"
              />
            </Field>
          </div>
          <Field label="Year">
            <input
              className={INPUT}
              type="number"
              value={season.year}
              onChange={(e) =>
                setSeason((p) => p ? { ...p, year: Number(e.target.value) } : p)
              }
            />
          </Field>
          <Field label="Season type">
            <select
              className={INPUT}
              value={season.season_type}
              onChange={(e) =>
                setSeason((p) => p ? { ...p, season_type: e.target.value as typeof season.season_type } : p)
              }
            >
              {SEASON_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section>
        <SectionHeader label="Settings" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select
              className={INPUT}
              value={season.status}
              onChange={(e) =>
                setSeason((p) => p ? { ...p, status: e.target.value as typeof season.status } : p)
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Max run differential">
            <input
              className={INPUT}
              type="number"
              value={season.maxrundiff ?? ""}
              onChange={(e) =>
                setSeason((p) =>
                  p ? { ...p, maxrundiff: e.target.value === "" ? null : Number(e.target.value) } : p
                )
              }
              placeholder="e.g. 10 (leave blank for none)"
            />
          </Field>
          <Field label="Forfeit run differential">
            <input
              className={INPUT}
              type="number"
              min={0}
              value={season.forfeit_run_diff ?? ""}
              onChange={(e) =>
                setSeason((p) =>
                  p ? { ...p, forfeit_run_diff: e.target.value === "" ? null : Number(e.target.value) } : p
                )
              }
              placeholder="e.g. 7 (leave blank for 0)"
            />
          </Field>
          <Field label="Teams advance to playoffs">
            <input
              className={INPUT}
              type="number"
              value={season.advances_to_playoffs ?? ""}
              onChange={(e) =>
                setSeason((p) =>
                  p ? { ...p, advances_to_playoffs: e.target.value === "" ? null : Number(e.target.value) } : p
                )
              }
              placeholder="e.g. 4"
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeader label="Division & League" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm" style={{ fontFamily: "var(--font-body)" }}>
          <div>
            <p className="label-section mb-1">Division</p>
            <p className="text-foreground">
              {season.division_name}
              {season.division_age_range ? ` · Ages ${season.division_age_range}` : ""}
            </p>
          </div>
          <div>
            <p className="label-section mb-1">League</p>
            <p className="text-foreground">{season.league_name}</p>
          </div>
          {season.governing_body_name && (
            <div>
              <p className="label-section mb-1">Governing body</p>
              <p className="text-foreground">{season.governing_body_name}</p>
            </div>
          )}
        </div>
      </section>

      <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
        Click <strong>Save</strong> in the top bar to apply changes.
      </p>
    </div>
  );
}

export default function SeasonOverviewPage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="overview" enableSave>
        <OverviewForm />
      </SeasonShell>
    </SeasonProvider>
  );
}
