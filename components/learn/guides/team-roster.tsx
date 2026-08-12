import Link from "next/link";
import type { GuideSection } from "@/lib/learn/registry";
import { Step } from "@/components/learn/Step";
import { Figure } from "@/components/learn/Figure";
import { Callout } from "@/components/learn/Callout";

export const sections: GuideSection[] = [
  { id: "open", label: "Open the roster" },
  { id: "add", label: "Add players & staff" },
  { id: "details", label: "Fill in the details" },
  { id: "positions", label: "Set positions" },
  { id: "parent-view", label: "Team Parent View" },
  { id: "manage", label: "Edit or remove" },
];

export default function TeamRoster() {
  return (
    <div>
      <Step num={1} id="open" title="Open the roster">
        <p>
          Open your team from <strong className="text-foreground">Teams</strong> in the header, then switch to the{" "}
          <strong className="text-foreground">Roster</strong> tab. Everyone can see a team&apos;s roster, but you&apos;ll
          only see the buttons for adding and editing people if you&apos;re a coach or manager with edit access to the
          team.
        </p>
        <Figure src="/learn/roster-empty.png" alt="A brand-new team with an empty roster" caption="A brand-new team — an empty roster, with Add person ready to go" />
      </Step>

      <Step num={2} id="add" title="Add players & staff">
        <p>
          Hit <strong className="text-foreground">Add person</strong> and fill in the quick row: jersey number, first
          name, last name, and a <strong className="text-foreground">role</strong> of Player or Staff. First name and
          role are required — everything else can wait. Save and it drops straight into the list, with the cursor back
          in the jersey field so you can rattle off the whole team without reaching for the mouse.
        </p>
        <Figure src="/learn/roster.png" alt="A team's Roster tab listing players and staff" caption="The roster fills in — players and staff in separate groups" />
        <Callout variant="tip">
          Players and staff share one roster but show in separate groups. Add coaches, team parents, and scorekeepers as
          Staff — they don&apos;t need a jersey number, and they stay out of lineups and batting orders.
        </Callout>
      </Step>

      <Step num={3} id="details" title="Fill in the details">
        <p>
          Click anyone&apos;s name to open their page. Beyond the basics you can add a{" "}
          <strong className="text-foreground">hat monogram</strong> and a{" "}
          <strong className="text-foreground">walk-up song</strong> — start typing a song and pick the match from the
          list to link it. Use <strong className="text-foreground">Edit</strong> to change anything; everything you
          enter here shows up wherever the player appears.
        </p>
      </Step>

      <Step num={4} id="positions" title="Set positions">
        <p>
          On a player&apos;s page, mark their <strong className="text-foreground">primary</strong> and{" "}
          <strong className="text-foreground">secondary</strong> positions. This is the payoff step: those positions
          drive the defensive-lineup builder, so a well-tagged roster turns into fair, valid fielding cards in a
          fraction of the time.
        </p>
        <p>
          <strong className="text-foreground">Every coach keeps their own set.</strong> What you mark is yours — no
          other coach can change it, and you can&apos;t change theirs. Under the grid you&apos;ll see what the rest of
          the staff thinks, and <strong className="text-foreground">Copy to mine</strong> if you&apos;d rather start
          from someone else&apos;s read.
        </p>
        <p>
          Back on the roster, the <strong className="text-foreground">Positions</strong> dropdown switches the chips
          between your assignments, any other coach&apos;s, and{" "}
          <strong className="text-foreground">Consensus</strong> — the staff&apos;s combined view. Consensus goes with
          the majority, and where the majority is tied it says so instead of guessing: a dashed chip with a{" "}
          <strong className="text-foreground">?</strong> means no agreement. Hover it to see who said what. The same
          dropdown appears on a game&apos;s Defense tab, so you can build a lineup off whichever read you trust.
        </p>
        <Figure src="/learn/positions.png" alt="A player's page with primary and secondary positions selected" caption="Player page — primary and secondary positions feed the lineup builder" />
        <Callout variant="note">
          Positions are the bridge to game day. Once they&apos;re set, see{" "}
          <Link href="/learn/defensive-lineups" className="text-primary hover:underline">
            Defensive lineups, start to finish
          </Link>{" "}
          for the printable card.
        </Callout>
        <Callout variant="warning">
          Position assignments are staff-only, and only this team&apos;s{" "}
          <strong className="text-foreground">coaches and managers</strong> can set them. Admins — league, division,
          and system — can see every coach&apos;s assignments and switch between them, but they keep no set of their
          own and can&apos;t change anyone else&apos;s. Players, parents, and everyone else see nothing at all: not on
          the roster, not on a player&apos;s page, not on a game.
        </Callout>
      </Step>

      <Step num={5} id="parent-view" title="Team Parent View">
        <p>
          Flip on <strong className="text-foreground">Team Parent View</strong> at the top of the roster to reveal hat
          monograms and walk-up songs as extra columns you can edit inline — changes save automatically when you click
          away. It&apos;s the fastest way to collect the fun stuff from the whole team in one sitting, without opening
          each player&apos;s page.
        </p>
        <Figure src="/learn/roster-parent-view.png" alt="The roster with Team Parent View on, showing hat monogram and walk-up song columns" caption="Team Parent View — hat monograms and walk-up songs, editable inline" />
      </Step>

      <Step num={6} id="manage" title="Edit or remove">
        <p>
          Reorganizing mid-season is fine — edit a jersey number or flip someone between Player and Staff at any time.
          To take someone off, open their page and use <strong className="text-foreground">Delete</strong> in the Danger
          Zone. It asks you to confirm first, since it&apos;s permanent.
        </p>
        <Figure src="/learn/roster-danger.png" alt="The Danger Zone card on a player's page with a Delete button" caption="A player's page — Delete lives in the Danger Zone and asks you to confirm" />
        <Callout variant="warning">
          Deleting removes the person from the roster entirely. If a player is leaving but you want their past lineups
          and history to stay readable, an admin can anonymize them instead — that keeps the jersey number and game
          record while erasing personal details.
        </Callout>
      </Step>
    </div>
  );
}
