// pages/tournaments/[tournamentid]/overview.tsx
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-section">{label}</label>
      {children}
    </div>
  );
}

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

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="pb-2 mb-4 border-b border-border">
      <span style={SECTION_HEADER_STYLE}>{label}</span>
    </div>
  );
}

function OverviewForm() {
  const { t, setT, divisions, statuses, visibilities } = useTournament();
  if (!t) return null;

  return (
    <div className="space-y-7 max-w-2xl">
      <section>
        <SectionHeader label="Basic Information" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Tournament name">
              <input
                className={INPUT}
                value={t.name ?? ""}
                onChange={(e) => setT((p) => (p ? { ...p, name: e.target.value } : p))}
                placeholder="e.g. Summer Classic 2025"
              />
            </Field>
          </div>
          <Field label="Division">
            <select
              className={INPUT}
              value={t.divisionid ? String(t.divisionid) : ""}
              onChange={(e) => setT((p) => (p ? { ...p, divisionid: Number(e.target.value) } : p))}
            >
              {divisions.map((d) => (
                <option key={String(d.id)} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <input
              className={INPUT}
              type="number"
              value={t.year ?? ""}
              onChange={(e) =>
                setT((p) => (p ? { ...p, year: e.target.value === "" ? null : Number(e.target.value) } : p))
              }
              placeholder={String(new Date().getFullYear())}
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeader label="Location" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="City">
            <input
              className={INPUT}
              value={t.city ?? ""}
              onChange={(e) => setT((p) => (p ? { ...p, city: e.target.value } : p))}
              placeholder="San Marcos"
            />
          </Field>
          <Field label="State">
            <input
              className={INPUT}
              value={t.state ?? ""}
              onChange={(e) => setT((p) => (p ? { ...p, state: e.target.value } : p))}
              placeholder="CA"
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeader label="Settings" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Max run differential">
            <input
              className={INPUT}
              type="number"
              value={t.maxrundiff ?? ""}
              onChange={(e) =>
                setT((p) => (p ? { ...p, maxrundiff: e.target.value === "" ? null : Number(e.target.value) } : p))
              }
              placeholder="e.g. 10"
            />
          </Field>
          <Field label="Forfeit run differential">
            <input
              className={INPUT}
              type="number"
              min={0}
              value={t.forfeit_run_diff ?? ""}
              onChange={(e) =>
                setT((p) => (p ? { ...p, forfeit_run_diff: e.target.value === "" ? null : Number(e.target.value) } : p))
              }
              placeholder="e.g. 7 (leave blank for 0)"
            />
          </Field>
          <Field label="Pool groups">
            <input
              className={INPUT}
              type="number"
              min={1}
              max={8}
              value={t.num_pool_groups ?? ""}
              onChange={(e) =>
                setT((p) => (p ? { ...p, num_pool_groups: e.target.value === "" ? null : Number(e.target.value) } : p))
              }
              placeholder="e.g. 2"
            />
          </Field>
          <Field label="Teams advance per group">
            <input
              className={INPUT}
              type="number"
              min={1}
              value={t.advances_per_group ?? ""}
              onChange={(e) =>
                setT((p) => (p ? { ...p, advances_per_group: e.target.value === "" ? null : Number(e.target.value) } : p))
              }
              placeholder="e.g. 1"
            />
          </Field>
          <Field label="Status">
            <select
              className={INPUT}
              value={t.statusid ? String(t.statusid) : ""}
              onChange={(e) => setT((p) => (p ? { ...p, statusid: Number(e.target.value) } : p))}
            >
              {statuses.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Visibility">
            <select
              className={INPUT}
              value={t.visibilityid ? String(t.visibilityid) : ""}
              onChange={(e) => setT((p) => (p ? { ...p, visibilityid: Number(e.target.value) } : p))}
            >
              {visibilities.map((v) => (
                <option key={String(v.id)} value={String(v.id)}>{v.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
        Click <strong>Save</strong> in the top bar to apply changes.
      </p>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="overview" enableSave>
        <OverviewForm />
      </TournamentShell>
    </TournamentProvider>
  );
}
