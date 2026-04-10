# Game Lineup Card PDF

**Date:** 2026-04-07  
**Status:** Approved

## Context

Coaches using the game detail page can set a batting order and per-inning defensive lineup. There is currently no way to print or export that data. This feature adds a "Reports" tab to the game detail page with a "Lineup Card" report that downloads a formatted PDF — a baseball-style card showing the batting order and a field diagram for each inning.

## Decisions

| Question | Decision |
|---|---|
| Whose lineup? | One team at a time (user picks home or away) |
| Where to launch? | New "Reports" tab on the game detail page |
| Output format | Download PDF (or open in new tab on iOS) |
| PDF library | `@react-pdf/renderer` (client-side, no server involvement) |
| Innings per page | 2 per page |

## Components

### `components/games/ReportsTab.tsx`
The Reports tab UI. Receives the full game object as a prop (already loaded by the parent page).

- Team selector: dropdown for home or away team (shows team names)
- "Generate Lineup Card" button
- On click:
  1. Sets loading state
  2. Parallel fetch: `GET /api/games/[source]/[gameId]/batting-order?team=[teamId]` and `GET /api/games/[source]/[gameId]/defensive-lineup?team=[teamId]`
  3. Passes results to `generateLineupCardPDF()`
  4. Triggers download (or `window.open` on iOS — see Cross-browser section)
- Error state if fetch fails or data is empty

### `components/games/LineupCardPDF.tsx`
The `@react-pdf/renderer` document component. Accepts typed props; renders the full PDF.

**Props:**
```ts
interface LineupCardPDFProps {
  game: GameDetail;           // date, time, location, field, home/away team names
  teamName: string;
  opponentName: string;
  battingOrder: BattingOrderEntry[];   // { bat_order, first_name, last_name, jersey_number }
  defensiveLineup: DefensiveLineupEntry[];  // { inning, position, first_name, last_name }
  innings: number;            // highest inning number in defensiveLineup
}
```

### `lib/lineup-card-pdf.ts`
Helper: `generateLineupCardPDF(props)` — calls `pdf(<LineupCardPDF {...props} />).toBlob()`, then triggers download or `window.open` depending on platform.

---

## PDF Structure

### Page 1 — Header + Batting Order
- **Header bar** (dark background): team name · "vs. [opponent]" · date · time · location/field
- **Batting Order** section:
  - Numbered list: bat slot · jersey # · last name, first initial
  - Two-column layout if ≥ 10 batters

### Pages 2–N — Defensive Lineups
- 2 innings per page, side by side
- Odd number of innings → last page has one diagram, right side is empty
- Each inning block:
  - Inning number label (e.g. "Inning 3")
  - Field diagram SVG (see below)
  - Small repeating game header (team · date) in page footer for context when pages are separated

---

## Field Diagram

SVG-based baseball diamond. Positions and coordinates (viewBox `0 0 280 240`):

| Position | Placement |
|---|---|
| CF | Top center outfield |
| LF | Upper-left outfield |
| RF | Upper-right outfield |
| SS | Midpoint of 3B→2B infield edge (boundary line) |
| 2B | Midpoint of 2B→1B infield edge (boundary line) |
| 3B | Near 3B bag, inside infield |
| 1B | Near 1B bag, inside infield |
| P | Pitcher's mound (center) |
| C | Below home plate |
| DH / BN | Not shown on diagram |

Each label shows: `Last Name (POS)` — e.g. `Martinez (CF)`

---

## Cross-browser Download

```ts
const blob = await pdf(<LineupCardPDF {...props} />).toBlob();
const url = URL.createObjectURL(blob);

// iOS Safari does not support <a download> on blob URLs
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
if (isIOS) {
  window.open(url);   // opens in native PDF viewer; user can save/print from share sheet
} else {
  const a = document.createElement('a');
  a.href = url;
  a.download = `lineup-${gameDate}-${teamName}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## New Dependency

`@react-pdf/renderer` — installed as a regular dependency. Client-side only; not imported in any API route or server code.

---

## Integration Point

**`pages/games/[source]/[gameId].tsx`** — add `"reports"` to the game tab union type and tab list, render `<ReportsTab game={game} />`. The game object already contains both team names, date, time, and location.

---

## What's Out of Scope

- Both teams on one PDF
- Server-side rendering
- Reports from any page other than the game detail page
- Printing confirmations or any other game data

---

## Verification

1. Install `@react-pdf/renderer`, navigate to any game with a batting order and defensive lineup set
2. Click the Reports tab → select a team → click "Generate Lineup Card"
3. Verify PDF downloads (desktop) or opens in viewer (iOS)
4. Check page 1: game header info correct, batting order matches what's in the Batting Order tab
5. Check inning pages: correct player at each position, 2 innings per page, inning count matches Defense tab
6. Test with an odd number of innings (e.g. 5) — last page should have one diagram only
7. Test with a team that has no lineup set — should show an appropriate empty/error state
