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
  CF:  { x: 140, y: 14,  anchor: "middle", fill: "#1a1a1a" },
  LF:  { x: 52,  y: 38,  anchor: "middle", fill: "#1a1a1a" },
  RF:  { x: 228, y: 38,  anchor: "middle", fill: "#1a1a1a" },
  SS:  { x: 94,  y: 87,  anchor: "middle", fill: "#1a1a1a" },
  "2B":{ x: 186, y: 87,  anchor: "middle", fill: "#1a1a1a" },
  "3B":{ x: 65,  y: 122, anchor: "middle", fill: "#1a1a1a" },
  "1B":{ x: 215, y: 122, anchor: "middle", fill: "#1a1a1a" },
  P:   { x: 140, y: 152, anchor: "middle", fill: "#1a1a1a" },
  C:   { x: 140, y: 225, anchor: "middle", fill: "#1a1a1a" },
};

// Height of each field diagram SVG (fixed, so rotated label SVG can match)
const DIAGRAM_HEIGHT = 210;

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, padding: 28, backgroundColor: "white" },
  // Header bar — lighter green for less ink
  headerBar: { backgroundColor: "#2e5c2e", padding: "8 12", marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerTeam: { color: "white", fontSize: 13, fontFamily: "Helvetica-Bold" },
  headerVs: { color: "white", fontSize: 8, opacity: 0.85, marginTop: 2 },
  headerMeta: { color: "white", fontSize: 8, opacity: 0.85, textAlign: "right" },
  // Section title
  sectionTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: "#555555", borderBottomWidth: 1, borderBottomColor: "#dddddd", paddingBottom: 3, marginBottom: 5 },
  // Batting order
  batGrid: { flexDirection: "row", flexWrap: "wrap" },
  batRow: { width: "50%", flexDirection: "row", alignItems: "center", marginBottom: 3, gap: 5 },
  batNum: { backgroundColor: "#d44f1a", color: "white", width: 14, height: 14, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 3 },
  batName: { fontSize: 8.5, flex: 1 },
  // Inning section
  inningStack: { flexDirection: "column", marginTop: 10 },
  inningRow: { flexDirection: "row", alignItems: "stretch" },
  inningDivider: { borderTopWidth: 1.5, borderTopColor: "#aaaaaa", marginTop: 8, marginBottom: 8 },
});

function formatDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function FieldDiagram({ lineup }: { lineup: DefenseEntry[] }) {
  const byPos: Record<string, string> = {};
  for (const e of lineup) {
    byPos[e.position] = `${e.first_name} ${e.last_name} (${e.position})`;
  }

  return (
    <Svg viewBox="0 0 280 240" width="100%" height={DIAGRAM_HEIGHT}>
      {/* Light green outfield — reduced ink */}
      <Rect x={0} y={0} width={280} height={240} fill="#7ab870" rx={3} />
      {/* Foul lines — solid, from home plate tip through bases to outfield corners */}
      {/* Left foul line: home tip (140,200) → through 3B (65,125) → corner (0,55) */}
      <Line x1={140} y1={200} x2={0} y2={55} stroke="white" strokeWidth={1.2} opacity={0.6} />
      {/* Right foul line: home tip (140,200) → through 1B (215,125) → corner (280,55) */}
      <Line x1={140} y1={200} x2={280} y2={55} stroke="white" strokeWidth={1.2} opacity={0.6} />
      {/* Infield dirt — lighter tan */}
      <Polygon points="140,195 65,125 140,55 215,125" fill="#e8d898" stroke="#c8a848" strokeWidth={1.2} />
      {/* Pitcher mound */}
      <Circle cx={140} cy={130} r={9} fill="#d4bc78" />
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
            fill={coord.fill}
            textAnchor={coord.anchor}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            style={{ fontSize: 11, fontFamily: "Helvetica-Bold" } as any}
          >
            {label}
          </Text>
        );
      })}
    </Svg>
  );
}

function InningLabel({ inning }: { inning: number }) {
  const mid = DIAGRAM_HEIGHT / 2;
  return (
    <Svg width={24} height={DIAGRAM_HEIGHT}>
      <Text
        x={12}
        y={mid}
        fill="#cc3a00"
        textAnchor="middle"
        transform={`rotate(-90 12 ${mid})`}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style={{ fontSize: 15, fontFamily: "Helvetica-Bold" } as any}
      >
        Inning {inning}
      </Text>
    </Svg>
  );
}

function BattingOrderSection({ battingOrder }: { battingOrder: BattingEntry[] }) {
  return (
    <>
      <Text style={s.sectionTitle}>Batting Order</Text>
      <View style={s.batGrid}>
        {battingOrder.map((b) => (
          <View key={b.bat_order} style={s.batRow}>
            <View style={s.batNum}>
              <Text>{b.bat_order}</Text>
            </View>
            <Text style={s.batName}>
              {b.first_name ? `${b.first_name} ` : ""}{b.last_name}
            </Text>
          </View>
        ))}
      </View>
    </>
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

  // Pair innings: each pair goes on one page
  const inningPages: Array<[number, number | null]> = [];
  for (let i = 0; i < innings.length; i += 2) {
    inningPages.push([innings[i], innings[i + 1] ?? null]);
  }

  // Every page: header + batting order + up to 2 stacked inning diagrams.
  // If no innings, show just the batting order on one page.
  const pages = inningPages.length > 0 ? inningPages : [[null, null] as [null, null]];

  return (
    <Document>
      {pages.map((pair, pageIdx) => {
        const [inn1, inn2] = pair as [number | null, number | null];
        return (
          <Page key={pageIdx} size="LETTER" style={s.page}>
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

            {/* Batting Order — repeated on every page */}
            <BattingOrderSection battingOrder={battingOrder} />

            {/* Stacked inning diagrams */}
            {inn1 != null && (
              <View style={s.inningStack}>
                {/* Inning 1 */}
                <View style={s.inningRow}>
                  <InningLabel inning={inn1} />
                  <View style={{ flex: 1 }}>
                    <FieldDiagram lineup={byInning[inn1] ?? []} />
                  </View>
                </View>

                {/* Divider + Inning 2 */}
                {inn2 != null && (
                  <>
                    <View style={s.inningDivider} />
                    <View style={s.inningRow}>
                      <InningLabel inning={inn2} />
                      <View style={{ flex: 1 }}>
                        <FieldDiagram lineup={byInning[inn2] ?? []} />
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}
          </Page>
        );
      })}
    </Document>
  );
}
