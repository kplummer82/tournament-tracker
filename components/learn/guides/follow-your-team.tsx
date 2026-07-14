import type { GuideSection } from "@/lib/learn/registry";
import { Step } from "@/components/learn/Step";
import { Figure } from "@/components/learn/Figure";
import { Callout } from "@/components/learn/Callout";

export const sections: GuideSection[] = [
  { id: "find", label: "Find your team" },
  { id: "follow", label: "Follow it" },
  { id: "home", label: "Your home page" },
  { id: "gameday", label: "Game day" },
];

export default function FollowYourTeam() {
  return (
    <div>
      <Step num={1} id="find" title="Find your team">
        <p>
          Open <strong className="text-foreground">Teams</strong> in the header and search by team name. You can also
          get there from the league side: <strong className="text-foreground">Leagues</strong> → your league → the
          division → the season — every team in the season links to its team page.
        </p>
      </Step>

      <Step num={2} id="follow" title="Follow it">
        <p>
          On the team page, hit <strong className="text-foreground">Follow</strong>. That&apos;s it. You can follow as
          many teams, leagues, divisions, and tournaments as you like — kids on three teams is a solved problem.
        </p>
        <Figure src="/learn/follow-team.png" alt="A team page with the Follow button" caption="Team page — Follow lives next to the team name" />
      </Step>

      <Step num={3} id="home" title="Your home page">
        <p>
          Everything you follow collects on <strong className="text-foreground">Home</strong>, grouped into My Teams,
          My Leagues, My Divisions, and My Tournaments. Each entry is one tap from the schedule, standings, or
          bracket.
        </p>
        <Figure src="/learn/home-follows.png" alt="Home page showing followed teams and leagues" caption="Home — your followed teams, one tap deep" />
      </Step>

      <Step num={4} id="gameday" title="Game day">
        <p>
          From your team&apos;s page, the calendar shows every game — season, tournament, and scrimmage. Open a game
          for the time, field, and a <strong className="text-foreground">Directions</strong> link straight into your
          maps app. Standings and brackets update live as scores post.
        </p>
        <Callout variant="tip">
          Follow the league too, not just the team — that puts the division standings and playoff bracket on your home
          page next to the schedule.
        </Callout>
      </Step>
    </div>
  );
}
