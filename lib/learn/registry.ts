import type { ComponentType } from "react";
import GettingStarted, { sections as gettingStartedSections } from "@/components/learn/guides/getting-started";
import FollowYourTeam, { sections as followYourTeamSections } from "@/components/learn/guides/follow-your-team";
import DefensiveLineups, { sections as defensiveLineupsSections } from "@/components/learn/guides/defensive-lineups";
import FirstSeason, { sections as firstSeasonSections } from "@/components/learn/guides/first-season";
import TeamRoster, { sections as teamRosterSections } from "@/components/learn/guides/team-roster";
import guideSources from "./guide-sources.json";

export type LearnPersona = "follower" | "coach" | "league-operator" | "tournament-organizer";

export const PERSONA_LABELS: Record<LearnPersona, string> = {
  "follower": "Parents & Fans",
  "coach": "Coaches",
  "league-operator": "League Operators",
  "tournament-organizer": "Tournament Organizers",
};

export type GuideCategory =
  | "getting-started"
  | "teams"
  | "lineups"
  | "leagues"
  | "tournaments"
  | "scrimmages";

export interface GuideMeta {
  slug: string;
  title: string;
  summary: string;            // hub card + meta description
  personas: LearnPersona[];   // hub filter chips
  category: GuideCategory;
  order: number;              // hub sort
  updated?: string;           // ISO date shown on the guide — derived from
                              // guide-sources.json `reviewed`, not set by hand
  heroImage?: string;         // /learn/*.png — og:image + hub card
  pdfHref?: string;           // optional downloadable deck
  relatedRoutes?: string[];   // phase 2: contextual links from feature pages
}

export interface GuideSection {
  id: string;
  label: string;
}

export interface GuideEntry extends GuideMeta {
  Component: ComponentType;
  sections?: GuideSection[];
}

/* When a guide is verified against the app, bump its `reviewed` date in
   lib/learn/guide-sources.json — that single date both drives the "Updated"
   line below and silences `npm run learn:drift` for that guide. */
const REVIEWED: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(guideSources.guides).map(([slug, meta]) => [slug, (meta as { reviewed?: string }).reviewed])
);

const GUIDE_DEFS: Omit<GuideEntry, "updated">[] = [
  {
    slug: "getting-started",
    title: "Getting started with Stacked Bench",
    summary: "Create an account, accept an invite, sign in, and find your way around.",
    personas: ["follower", "coach", "league-operator", "tournament-organizer"],
    category: "getting-started",
    order: 1,
    heroImage: "/learn/signup.png",
    Component: GettingStarted,
    sections: gettingStartedSections,
  },
  {
    slug: "follow-your-team",
    title: "Find & follow your team",
    summary: "Follow teams, leagues, and tournaments so schedules, standings, and brackets are one tap away.",
    personas: ["follower"],
    category: "getting-started",
    order: 2,
    heroImage: "/learn/follow-team.png",
    relatedRoutes: ["/teams"],
    Component: FollowYourTeam,
    sections: followYourTeamSections,
  },
  {
    slug: "defensive-lineups",
    title: "Defensive lineups, start to finish",
    summary: "From roster position priorities to the printable game-day card — including the optional fairness rules.",
    personas: ["coach"],
    category: "lineups",
    order: 3,
    heroImage: "/learn/defense-grid.png",
    pdfHref: "/learn/defensive-lineup-guide.pdf",
    relatedRoutes: ["/games"],
    Component: DefensiveLineups,
    sections: defensiveLineupsSections,
  },
  {
    slug: "first-season",
    title: "Set up your first season",
    summary: "Leagues, divisions, seasons, teams, and a published schedule — the league operator's path from zero to opening day.",
    personas: ["league-operator"],
    category: "leagues",
    order: 4,
    heroImage: "/learn/season-overview.png",
    relatedRoutes: ["/leagues"],
    Component: FirstSeason,
    sections: firstSeasonSections,
  },
  {
    slug: "team-roster",
    title: "Create & manage a team roster",
    summary: "Add players and staff, set jersey numbers and positions, and keep the roster current all season.",
    personas: ["coach"],
    category: "teams",
    order: 5,
    heroImage: "/learn/roster.png",
    relatedRoutes: ["/teams"],
    Component: TeamRoster,
    sections: teamRosterSections,
  },
];

export const GUIDES: GuideEntry[] = GUIDE_DEFS.map((g) => ({ ...g, updated: REVIEWED[g.slug] }));

export function getGuide(slug: string): GuideEntry | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
