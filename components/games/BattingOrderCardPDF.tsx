import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";
import type { BattingEntry } from "@/components/games/LineupCardPDF";

interface BattingOrderCardPDFProps {
  game: GameDetail;
  teamName: string;
  opponentName: string;
  battingOrder: BattingEntry[];
}

function formatDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 11, padding: 36, backgroundColor: "white" },
  headerBar: { backgroundColor: "#2e5c2e", padding: "10 14", marginBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerTeam: { color: "white", fontSize: 16, fontFamily: "Helvetica-Bold" },
  headerVs: { color: "white", fontSize: 9, opacity: 0.85, marginTop: 3 },
  headerMeta: { color: "white", fontSize: 9, opacity: 0.85, textAlign: "right" },
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: "#555555", borderBottomWidth: 1, borderBottomColor: "#dddddd", paddingBottom: 4, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#eeeeee", gap: 12 },
  orderNum: { width: 22, fontSize: 12, fontFamily: "Helvetica-Bold", color: "#888888", textAlign: "right" },
  jerseyBadge: { backgroundColor: "#d44f1a", color: "white", width: 26, height: 22, fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 4, borderRadius: 3 },
  jerseyBlank: { width: 26 },
  playerName: { fontSize: 13, fontFamily: "Helvetica-Bold", flex: 1 },
});

export function BattingOrderCardPDF({ game, teamName, opponentName, battingOrder }: BattingOrderCardPDFProps) {
  const dateStr = formatDate(game.gamedate);
  const timeStr = game.gametime
    ? new Date(`1970-01-01T${game.gametime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";
  const venue = [game.location, game.field].filter(Boolean).join(" · ");
  const metaLines = [dateStr, timeStr, venue].filter(Boolean);

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
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

        <Text style={s.sectionTitle}>Batting Order</Text>

        {battingOrder.map((b) => (
          <View key={b.bat_order} style={s.row}>
            <Text style={s.orderNum}>{b.bat_order}.</Text>
            {b.jersey_number != null ? (
              <View style={s.jerseyBadge}>
                <Text>{b.jersey_number}</Text>
              </View>
            ) : (
              <View style={s.jerseyBlank} />
            )}
            <Text style={s.playerName}>
              {b.first_name ? `${b.first_name} ` : ""}{b.last_name}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
