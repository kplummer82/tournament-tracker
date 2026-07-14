import type { GuideSection } from "@/lib/learn/registry";
import { Step } from "@/components/learn/Step";
import { Figure } from "@/components/learn/Figure";
import { Callout } from "@/components/learn/Callout";

export const sections: GuideSection[] = [
  { id: "positions", label: "Set position priorities" },
  { id: "confirm", label: "Confirm who's playing" },
  { id: "batting", label: "Batting order" },
  { id: "defense", label: "Build the defense" },
  { id: "rules", label: "Optional fairness rules" },
  { id: "report", label: "Print the game-day card" },
];

export default function DefensiveLineups() {
  return (
    <div>
      <Step num={1} id="positions" title="Set position priorities (once)">
        <p>
          On each player&apos;s roster page, click a position tile once for{" "}
          <strong className="text-foreground">primary (1°)</strong>, again for{" "}
          <strong className="text-foreground">secondary (2°)</strong>, once more to clear. Any mix works — a utility
          kid can carry four primaries.
        </p>
        <Figure src="/learn/positions.png" alt="Player position priority tiles" caption="Player page — position tiles cycle primary → secondary → clear" />
        <p>
          The roster list wears every player&apos;s positions as badges, so coverage gaps (who&apos;s the backup
          catcher?) show up before they bite.
        </p>
        <Figure src="/learn/roster.png" alt="Roster with position badges per player" caption="Roster — solid badge = primary, outlined = secondary" />
      </Step>

      <Step num={2} id="confirm" title="Confirm who's playing">
        <p>
          On the game page, the <strong className="text-foreground">Confirmations</strong> tab tracks who&apos;s in:
          confirmed, declined, or pending. Only confirmed players can be placed in a lineup — no ghosts in the batting
          order.
        </p>
        <Figure src="/learn/confirmations.png" alt="Game confirmations tab" caption="Confirmations — the lineup tabs stay locked until someone's confirmed" />
      </Step>

      <Step num={3} id="batting" title="Batting order">
        <p>
          <strong className="text-foreground">Auto-fill</strong> drops every confirmed player in by jersey number; drag
          the handles to arrange from there, then save.
        </p>
        <Figure src="/learn/batting-order.png" alt="Batting order tab with drag handles" caption="Batting order — auto-fill, then drag" />
      </Step>

      <Step num={4} id="defense" title="Build the defense">
        <p>
          The <strong className="text-foreground">Defense</strong> tab is a grid: nine positions down, innings across
          (six by default, up to nine). Every cell is a searchable picker sorted by fit — primaries first, then
          secondaries — and <strong className="text-foreground">Copy</strong> pulls the previous inning across so you
          only touch the seats that change.
        </p>
        <Figure src="/learn/defense-grid.png" alt="The defense grid, positions by innings" caption="Defense — positions × innings, with per-inning Copy" />
        <Figure src="/learn/defense-picker.png" alt="The player picker sorted by position priority" caption="The picker knows your roster — 1° players surface first" />
        <p>
          Anyone confirmed but not on the field lands on the <strong className="text-foreground">bench, computed per
          inning automatically</strong>. One hard rule: a player can&apos;t hold two positions in the same inning —
          those cells go red and Save locks until it&apos;s fixed.
        </p>
        <Figure src="/learn/defense-duplicate.png" alt="Duplicate player error blocking save" caption="Duplicates are the one hard stop" />
      </Step>

      <Step num={5} id="rules" title="Optional fairness rules">
        <p>Two opt-in rules — off by default, toggled per game, remembered for next time:</p>
        <ul className="list-none space-y-2">
          <li>
            <strong className="text-foreground">Fair sit</strong> — everyone sits once before anyone sits twice.
          </li>
          <li>
            <strong className="text-foreground">Fair outfield</strong> — everyone plays outfield once before anyone
            plays it twice.
          </li>
        </ul>
        <p>
          Break one and the app names names — an amber banner, tinted cells in the grid, highlighted names in the bench
          list — but <strong className="text-foreground">Save stays live</strong>. It&apos;s the coach&apos;s call.
        </p>
        <Figure src="/learn/defense-warnings.png" alt="Fairness rule warnings on the defense grid" caption="Warnings, not roadblocks — the banner says who repeats and who's still waiting" />
        <Callout variant="note">
          Only complete innings (all nine seats filled) are judged, so a half-built lineup never false-alarms while
          you&apos;re working.
        </Callout>
      </Step>

      <Step num={6} id="report" title="Print the game-day card">
        <p>
          The <strong className="text-foreground">Reports</strong> tab turns everything you just built into a PDF: a
          field diagram for every inning, the bench under each one, and the batting order alongside. Print it, clip it
          to the dugout fence, done.
        </p>
        <Figure src="/learn/lineup-card.png" alt="The generated lineup card PDF with per-inning field diagrams" caption="One click on Reports — every parent finds their kid's position at a glance" themed={false} />
      </Step>
    </div>
  );
}
