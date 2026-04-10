# Game Lineup Card PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reports" tab to the game detail page that lets a coach download a PDF lineup card showing the batting order and a per-inning field diagram.

**Architecture:** A new `ReportsTab` component handles team selection and triggers a client-side PDF download. A `LineupCardPDF` component (rendered by `@react-pdf/renderer`) defines the PDF layout: page 1 is game header + batting order, subsequent pages show 2 inning field diagrams each. A small `lib/lineup-card-pdf.ts` helper abstracts the blob generation and cross-browser download.

**Tech Stack:** Next.js 15 (Pages Router), React 19, TypeScript, `@react-pdf/renderer` (new dependency), Tailwind CSS v4

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `components/games/LineupCardPDF.tsx` | **Create** | `@react-pdf/renderer` document — all PDF layout |
| `lib/lineup-card-pdf.ts` | **Create** | `generateLineupCardPDF()` helper — blob generation + cross-browser download |
| `components/games/ReportsTab.tsx` | **Create** | Reports tab UI — team display + generate button |
| `pages/games/[source]/[gameId].tsx` | **Modify** | Add `"reports"` to `TabKey`, wire up `<ReportsTab>` |

---

## Task 1: Install dependency

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install `@react-pdf/renderer`**

```bash
npm install @react-pdf/renderer
```

Expected: package added to `dependencies` in `package.json`, `node_modules/@react-pdf` present.

- [ ] **Step 2: Verify TypeScript types are included**

```bash
npx tsc --noEmit 2>&1 | head -20
```

`@react-pdf/renderer` ships its own types — no `@types/` package needed. If you see errors unrelated to the new package, ignore them (pre-existing). If you see errors about `@react-pdf/renderer` not found, run `npm install` again.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @react-pdf/renderer for lineup card PDF generation"
```

---

## Task 2: PDF document component

**Files:**
- Create: `components/games/LineupCardPDF.tsx`

This component uses `@react-pdf/renderer` primitives only — no HTML, no Tailwind. It receives all data as props and is a pure render function.

**Position coordinates** (viewBox `0 0 280 240`, diamond corners: Home=140,195 · 1B=215,125 · 2B=140,55 · 3B=65,125):

| Position | x | y | label color |
|---|---|---|---|
| CF | 140 | 14 | white |
| LF | 52 | 38 | white |
| RF | 228 | 38 | white |
| SS | 94 | 87 | white (on 3B→2B edge midpoint) |
| 2B | 186 | 87 | white (on 2B→1B edge midpoint) |
| 3B | 65 | 122 | dark (#1a1a1a, inside infield) |
| 1B | 215 | 122 | dark (#1a1a1a, inside infield) |
| P | 140 | 152 | dark (#1a1a1a, on mound) |
| C | 140 | 225 | white (below home plate) |

- [ ] **Step 1: Create `components/games/LineupCardPDF.tsx`**

```tsx
import {
  Document,
  Page,
  View,
  Text,
  Svg,
  Rect,
  Polygon,
  Circle,
  Line,
  StyleSheet,
} from "@react-pdf/renderer";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";

export type BattingEntry = {
  bat_order: number;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
};

export type DefenseEntry = {
  inning: number;
  position: string;
  first_name: string;
  last_name: string;
};

interface LineupCardPDFProps {
  game: GameDetail;
  teamName: string;
  opponentName: string;
  battingOrder: BattingEntry[];
  defensiveLineup: DefenseEntry[];
}

// Positions that appear on the field diagram. DH and BN are excluded.
const DIAGRAM_POSITIONS = ["P","C","1B","2B","3B","SS","LF","CF","RF"] as const;
type DiagramPosition = typeof DIAGRAM_POSITIONS[number];

type PositionCoord = { x: number; y: number; anchor: "start" | "middle" | "end"; fill: string };

const POSITION_COORDS: Record<DiagramPosition, PositionCoord> = {
  CF:  { x: 140, y: 14,  anchor: "middle", fill: "white" },
  LF:  { x: 52,  y: 38,  anchor: "middle", fill: "white" },
  RF:  { x: 228, y: 38,  anchor: "middle", fill: "white" },
  SS:  { x: 94,  y: 87,  anchor: "middle", fill: "white" },
  "2B":{ x: 186, y: 87,  anchor: "middle", fill: "white" },
  "3B":{ x: 65,  y: 122, anchor: "middle", fill: "#1a1a1a" },
  "1B":{ x: 215, y: 122, anchor: "middle", fill: "#1a1a1a" },
  P:   { x: 140, y: 152, anchor: "middle", fill: "#1a1a1a" },
  C:   { x: 140, y: 225, anchor: "middle", fill: "white" },
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, padding: 28, backgroundColor: "white" },
  // Header bar
  headerBar: { backgroundColor: "#1a3a1a", padding: "8 12", marginBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerTeam: { color: "white", fontSize: 13, fontFamily: "Helvetica-Bold" },
  headerVs: { color: "white", fontSize: 8, opacity: 0.8, marginTop: 2 },
  headerMeta: { color: "white", fontSize: 8, opacity: 0.85, textAlign: "right" },
  // Section
  sectionTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: "#555555", borderBottomWidth: 1, borderBottomColor: "#dddddd", paddingBottom: 3, marginBottom: 6 },
  // Batting order
  batGrid: { flexDirection: "row", flexWrap: "wrap" },
  batRow: { width: "50%", flexDirection: "row", alignItems: "center", marginBottom: 3, gap: 5 },
  batNum: { backgroundColor: "#cc3a00", color: "white", width: 14, height: 14, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 3 },
  batName: { fontSize: 8.5, flex: 1 },
  batJersey: { fontSize: 7.5, color: "#888888" },
  // Inning pages
  inningPage: { fontFamily: "Helvetica", fontSize: 9, padding: 28, backgroundColor: "white" },
  inningRow: { flexDirection: "row", gap: 16, flex: 1 },
  inningBlock: { flex: 1 },
  inningTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#cc3a00", marginBottom: 6 },
  pageFooter: { marginTop: 8, fontSize: 7, color: "#aaaaaa", textAlign: "center" },
});

function formatDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function FieldDiagram({ lineup }: { lineup: DefenseEntry[] }) {
  const byPos: Record<string, string> = {};
  for (const e of lineup) {
    byPos[e.position] = `${e.last_name} (${e.position})`;
  }

  return (
    <Svg viewBox="0 0 280 240" width="100%" height={200}>
      {/* Green outfield */}
      <Rect x={0} y={0} width={280} height={240} fill="#3d7a35" rx={4} />
      {/* Foul lines */}
      <Line x1={140} y1={195} x2={5} y2={5} stroke="white" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.35} />
      <Line x1={140} y1={195} x2={275} y2={5} stroke="white" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.35} />
      {/* Infield dirt */}
      <Polygon points="140,195 65,125 140,55 215,125" fill="#c8a84b" stroke="#a07830" strokeWidth={1.5} />
      {/* Pitcher mound */}
      <Circle cx={140} cy={130} r={9} fill="#b8985a" />
      {/* Home plate */}
      <Polygon points="140,200 133,194 133,187 147,187 147,194" fill="white" />
      {/* Bases */}
      <Rect x={133} y={48} width={14} height={14} fill="white" rx={1} />
      <Polygon points="215,118 209,125 215,132 221,125" fill="white" />
      <Polygon points="65,118 59,125 65,132 71,125" fill="white" />
      {/* Player labels */}
      {DIAGRAM_POSITIONS.map((pos) => {
        const coord = POSITION_COORDS[pos];
        const label = byPos[pos] ?? "";
        if (!label) return null;
        return (
          <Text
            key={pos}
            x={coord.x}
            y={coord.y}
            style={{ fontSize: 9, fontFamily: "Helvetica-Bold", fill: coord.fill, textAnchor: coord.anchor }}
          >
            {label}
          </Text>
        );
      })}
    </Svg>
  );
}

export function LineupCardPDF({ game, teamName, opponentName, battingOrder, defensiveLineup }: LineupCardPDFProps) {
  const dateStr = formatDate(game.gamedate);
  const timeStr = game.gametime
    ? new Date(`1970-01-01T${game.gametime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";
  const venue = [game.location, game.field].filter(Boolean).join(" · ");
  const metaLines = [dateStr, timeStr, venue].filter(Boolean);

  // Group defensive lineup by inning
  const innings = [...new Set(defensiveLineup.map((e) => e.inning))].sort((a, b) => a - b);
  const byInning: Record<number, DefenseEntry[]> = {};
  for (const entry of defensiveLineup) {
    if (!byInning[entry.inning]) byInning[entry.inning] = [];
    byInning[entry.inning].push(entry);
  }

  // Pair innings into pages: [[1,2],[3,4],...]
  const inningPages: Array<[number, number | null]> = [];
  for (let i = 0; i < innings.length; i += 2) {
    inningPages.push([innings[i], innings[i + 1] ?? null]);
  }

  const footerText = `${teamName} vs ${opponentName}${dateStr ? " · " + dateStr : ""}`;

  return (
    <Document>
      {/* Page 1: Header + Batting Order */}
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.headerBar}>
          <View>
            <Text style={s.headerTeam}>{teamName}</Text>
            <Text style={s.headerVs}>vs. {opponentName}</Text>
          </View>
          <View>
            {metaLines.map((line, i) => (
              <Text key={i} style={s.headerMeta}>{line}</Text>
            ))}
          </View>
        </View>

        {/* Batting Order */}
        <Text style={s.sectionTitle}>Batting Order</Text>
        <View style={s.batGrid}>
          {battingOrder.map((b) => (
            <View key={b.bat_order} style={s.batRow}>
              <View style={s.batNum}>
                <Text>{b.bat_order}</Text>
              </View>
              <Text style={s.batName}>
                {b.last_name}, {b.first_name[0]}.{b.jersey_number != null ? `  ` : ""}
              </Text>
              {b.jersey_number != null && (
                <Text style={s.batJersey}>#{b.jersey_number}</Text>
              )}
            </View>
          ))}
        </View>
      </Page>

      {/* Pages 2–N: Defensive Lineups (2 per page) */}
      {inningPages.map(([inn1, inn2]) => (
        <Page key={inn1} size="LETTER" style={s.inningPage}>
          {/* Repeat mini header */}
          <View style={s.headerBar}>
            <Text style={s.headerTeam}>{teamName}</Text>
            <Text style={s.headerMeta}>
              vs. {opponentName}{dateStr ? `  ·  ${dateStr}` : ""}
            </Text>
          </View>

          <View style={s.inningRow}>
            {/* Inning 1 of pair */}
            <View style={s.inningBlock}>
              <Text style={s.inningTitle}>Inning {inn1}</Text>
              <FieldDiagram lineup={byInning[inn1] ?? []} />
            </View>

            {/* Inning 2 of pair (or blank) */}
            {inn2 != null ? (
              <View style={s.inningBlock}>
                <Text style={s.inningTitle}>Inning {inn2}</Text>
                <FieldDiagram lineup={byInning[inn2] ?? []} />
              </View>
            ) : (
              <View style={s.inningBlock} />
            )}
          </View>

          <Text style={s.pageFooter}>{footerText}</Text>
        </Page>
      ))}
    </Document>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep "LineupCardPDF"
```

Expected: no output (no errors in the new file). If you see errors about SVG primitives, check that `@react-pdf/renderer` is installed and its types are resolving.

- [ ] **Step 3: Commit**

```bash
git add components/games/LineupCardPDF.tsx
git commit -m "feat: add LineupCardPDF document component"
```

---

## Task 3: PDF generation helper

**Files:**
- Create: `lib/lineup-card-pdf.ts`

- [ ] **Step 1: Create `lib/lineup-card-pdf.ts`**

```ts
import { pdf } from "@react-pdf/renderer";
import { LineupCardPDF } from "@/components/games/LineupCardPDF";
import type { BattingEntry, DefenseEntry } from "@/components/games/LineupCardPDF";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";

export type { BattingEntry, DefenseEntry };

interface GenerateOptions {
  game: GameDetail;
  teamId: number;
  battingOrder: BattingEntry[];
  defensiveLineup: DefenseEntry[];
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function slugify(s: string | null): string {
  return (s ?? "team").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function generateLineupCardPDF({ game, teamId, battingOrder, defensiveLineup }: GenerateOptions): Promise<void> {
  const isHome = game.home === teamId;
  const teamName = (isHome ? game.home_team : game.away_team) ?? "Team";
  const opponentName = (isHome ? game.away_team : game.home_team) ?? "Opponent";
  const dateSlug = game.gamedate ?? "game";

  const blob = await pdf(
    LineupCardPDF({ game, teamName, opponentName, battingOrder, defensiveLineup })
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const filename = `lineup-${dateSlug}-${slugify(teamName)}.pdf`;

  if (isIOS()) {
    // iOS Safari doesn't support <a download> on blob URLs — open in viewer instead
    window.open(url);
    // Don't revoke immediately; the new tab needs the URL
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "lineup-card-pdf"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lib/lineup-card-pdf.ts
git commit -m "feat: add generateLineupCardPDF helper with cross-browser download"
```

---

## Task 4: ReportsTab component

**Files:**
- Create: `components/games/ReportsTab.tsx`

The tab receives `game`, `source`, `gameId`, and `teamId` (already selected by the parent). It fetches batting order and defensive lineup on demand when the user clicks "Generate".

- [ ] **Step 1: Create `components/games/ReportsTab.tsx`**

```tsx
import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { generateLineupCardPDF } from "@/lib/lineup-card-pdf";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";

interface ReportsTabProps {
  game: GameDetail;
  source: string;
  gameId: number;
  teamId: number;
}

type GenerateState = "idle" | "loading" | "error";

export function ReportsTab({ game, source, gameId, teamId }: ReportsTabProps) {
  const [state, setState] = useState<GenerateState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isHome = game.home === teamId;
  const teamName = (isHome ? game.home_team : game.away_team) ?? "Team";

  const handleGenerate = async () => {
    setState("loading");
    setErrorMsg(null);
    try {
      const [boRes, dlRes] = await Promise.all([
        fetch(`/api/games/${source}/${gameId}/batting-order?team=${teamId}`),
        fetch(`/api/games/${source}/${gameId}/defensive-lineup?team=${teamId}`),
      ]);

      if (!boRes.ok || !dlRes.ok) throw new Error("Failed to load lineup data");

      const [boData, dlData] = await Promise.all([boRes.json(), dlRes.json()]);

      if (!boData.order?.length && !dlData.lineup?.length) {
        throw new Error("No lineup data found for this team. Set the batting order and defensive lineup first.");
      }

      await generateLineupCardPDF({
        game,
        teamId,
        battingOrder: boData.order ?? [],
        defensiveLineup: dlData.lineup ?? [],
      });

      setState("idle");
    } catch (e) {
      setState("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to generate PDF");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Lineup Card
          </h2>
          <p className="text-sm text-muted-foreground">
            Download a PDF lineup card for <span className="text-foreground font-medium">{teamName}</span> showing
            the batting order and defensive positions for each inning.
          </p>

          <button
            onClick={handleGenerate}
            disabled={state === "loading"}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {state === "loading" ? "Generating…" : "Generate Lineup Card"}
          </button>

          {state === "error" && errorMsg && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "ReportsTab"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/games/ReportsTab.tsx
git commit -m "feat: add ReportsTab component for lineup card PDF download"
```

---

## Task 5: Wire Reports tab into the game detail page

**Files:**
- Modify: `pages/games/[source]/[gameId].tsx`

Three changes needed: (1) add `"reports"` to `TabKey`, (2) import `ReportsTab`, (3) add the tab trigger and content.

- [ ] **Step 1: Update `TabKey` type (line 17)**

Change:
```ts
type TabKey = "overview" | "confirmations" | "batting" | "defense";
```
To:
```ts
type TabKey = "overview" | "confirmations" | "batting" | "defense" | "reports";
```

- [ ] **Step 2: Add import at the top of the file (after the existing imports)**

Add after the last import line:
```ts
import { ReportsTab } from "@/components/games/ReportsTab";
```

- [ ] **Step 3: Add TabsTrigger (after the "defense" trigger, line ~1221)**

Change:
```tsx
            <TabsTrigger value="defense">Defense</TabsTrigger>
          </TabsList>
```
To:
```tsx
            <TabsTrigger value="defense">Defense</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
```

- [ ] **Step 4: Add TabsContent (after the defense TabsContent block, line ~1250)**

Add after the closing `</TabsContent>` of the defense tab and before `</Tabs>`:
```tsx
          <TabsContent value="reports" className="mt-6">
            {Number.isFinite(managingTeamId) ? (
              <ReportsTab
                game={game}
                source={source!}
                gameId={gameId}
                teamId={managingTeamId}
              />
            ) : (
              <TeamPickerCard game={game} manageable={manageable} onSelect={selectTeam} />
            )}
          </TabsContent>
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors. Pre-existing errors (if any) are fine.

- [ ] **Step 6: Commit**

```bash
git add pages/games/[source]/[gameId].tsx
git commit -m "feat: wire Reports tab into game detail page"
```

---

## Task 6: Smoke test end-to-end

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to a game that has batting order + defensive lineup set**

URL pattern: `http://localhost:3000/games/season/[id]?team=[teamId]`

If you don't have game data, navigate to any season schedule, open a game, set a batting order and at least one inning of defensive lineup.

- [ ] **Step 3: Click the "Reports" tab**

Expected: tab is visible, shows "Lineup Card" card with team name and "Generate Lineup Card" button.

- [ ] **Step 4: Click "Generate Lineup Card"**

Expected:
- Button shows spinner + "Generating…" while PDF is built
- PDF downloads (or opens in new tab on iOS)
- Page 1: game header + batting order list
- Page 2+: 2 inning field diagrams per page with player names at correct positions
- SS label appears on the 3B→2B edge; 2B label appears on the 2B→1B edge

- [ ] **Step 5: Test with no lineup data**

Navigate to a game with no batting order or defensive lineup set. Click "Generate".
Expected: error message "No lineup data found for this team…"

- [ ] **Step 6: Test with an odd number of innings (e.g. 5)**

Set a 5-inning defensive lineup. Generate the PDF.
Expected: inning pages show [1,2], [3,4], [5,blank] — last page has one diagram on the left.

---

## Self-Review Notes

- `LineupCardPDF` uses `@react-pdf/renderer`'s `<Text>` with SVG — note that `@react-pdf/renderer`'s SVG `<Text>` component accepts a `style` prop with `textAnchor`, `fill`, and `fontSize` (not standard SVG attributes directly). If SVG text doesn't render, pass `x`/`y` as props and move `fill`/`fontSize`/`textAnchor` into the `style` object.
- The `pdf()` call in `lib/lineup-card-pdf.ts` takes a React element. `LineupCardPDF({...})` calls the function directly to produce a React element — this is equivalent to `<LineupCardPDF ... />` and is compatible with `pdf()`.
- `@react-pdf/renderer` has no SSR support. The `generateLineupCardPDF` helper must only be called client-side (inside event handlers, never at module level or in `getServerSideProps`). The `ReportsTab` button's `onClick` is the correct call site.
