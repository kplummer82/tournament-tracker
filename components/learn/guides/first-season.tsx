import type { GuideSection } from "@/lib/learn/registry";
import { Step } from "@/components/learn/Step";
import { Figure } from "@/components/learn/Figure";
import { Callout } from "@/components/learn/Callout";

export const sections: GuideSection[] = [
  { id: "hierarchy", label: "The hierarchy, explained" },
  { id: "league", label: "Create the league & divisions" },
  { id: "season", label: "Create the season" },
  { id: "teams", label: "Add the teams" },
  { id: "schedule", label: "Build the schedule" },
  { id: "standings", label: "Standings & tiebreakers" },
];

export default function FirstSeason() {
  return (
    <div>
      <Step num={1} id="hierarchy" title="The hierarchy, explained">
        <p>Four levels, top to bottom — worth thirty seconds before you create anything:</p>
        <ul className="list-none space-y-2">
          <li><strong className="text-foreground">Governing body</strong> — the umbrella org (e.g., PONY, Little League).</li>
          <li><strong className="text-foreground">League</strong> — your organization (e.g., San Marcos Youth Baseball).</li>
          <li><strong className="text-foreground">Division</strong> — an age or skill bracket inside the league (e.g., Mustang).</li>
          <li><strong className="text-foreground">Season</strong> — one competition window in a division (e.g., Spring 2026), holding the teams, games, standings, and playoffs.</li>
        </ul>
        <p>Teams live in the league and get assigned into seasons — so next spring is a new season, not a new team.</p>
      </Step>

      <Step num={2} id="league" title="Create the league & divisions">
        <p>
          From <strong className="text-foreground">Leagues</strong>, create your league — you automatically become its
          admin. Then add a division for each age bracket you run.
        </p>
        <Figure src="/learn/leagues.png" alt="The leagues browser" caption="Leagues — create yours, then add divisions" />
      </Step>

      <Step num={3} id="season" title="Create the season">
        <p>
          Inside a division, create the season (name, year, type). The season page is command central from here on —
          Overview, Teams, Schedule, Standings, Tiebreakers, and Playoffs tabs.
        </p>
        <Figure src="/learn/season-overview.png" alt="A season overview page" caption="The season page — every tab you'll need for the rest of the year" />
      </Step>

      <Step num={4} id="teams" title="Add the teams">
        <p>
          On the season&apos;s <strong className="text-foreground">Teams</strong> tab, pull in existing league teams or
          create new ones. Coaches get access via email invites that carry the team-manager role with them — no
          post-signup permission wrangling.
        </p>
        <Figure src="/learn/season-teams.png" alt="Season teams tab" caption="Teams — assign into the season, invite the coaches" />
      </Step>

      <Step num={5} id="schedule" title="Build the schedule">
        <p>
          Enter games by hand on the <strong className="text-foreground">Schedule</strong> tab, or use auto-scheduling
          to generate a balanced slate from your locations, dates, and game-length rules — then adjust the exceptions.
        </p>
        <Figure src="/learn/season-schedule.png" alt="Season schedule tab" caption="Schedule — hand-entered or generated, coaches and parents see it instantly" />
      </Step>

      <Step num={6} id="standings" title="Standings & tiebreakers">
        <p>
          Standings compute live as scores post. Configure your <strong className="text-foreground">tiebreaker
          rules</strong> once (head-to-head, run differential, runs against…) and the table resolves ties the way your
          rulebook says — and when the regular season ends, seed the playoff bracket straight from the final table.
        </p>
        <Figure src="/learn/season-standings.png" alt="Season standings" caption="Standings — live, tiebreaker-aware, and the seed source for playoffs" />
        <Callout variant="tip">
          Run a year-end tournament too? The Tournaments side of the app handles pool play, seeding, and multi-bracket
          playoffs — same teams, no re-entry.
        </Callout>
      </Step>
    </div>
  );
}
