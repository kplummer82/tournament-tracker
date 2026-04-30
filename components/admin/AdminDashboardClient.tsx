"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Trophy,
  Swords,
  CalendarDays,
  Building2,
  ShieldCheck,
  Gamepad2,
  UserCog,
  AlertTriangle,
  Layers,
  Settings,
} from "lucide-react";
import KpiCard from "./dashboard/KpiCard";
import StatusBar from "./dashboard/StatusBar";
import CategoryCard from "./dashboard/CategoryCard";

type DashboardData = {
  users: { total: number; active: number; inactive: number; admins: number; recentSignups: number };
  roles: { total: number; byRole: Record<string, number> };
  leagues: { total: number; divisions: number };
  seasons: { total: number; byStatus: Record<string, number> };
  tournaments: { total: number; byStatus: Record<string, number> };
  games: {
    season: { total: number; byStatus: Record<string, number>; today: number; thisWeek: number; overdue: number };
    tournament: { total: number; byStatus: Record<string, number> };
  };
  coaches: { total: number; unassigned: number };
  scenarios: { total: number; byStatus: Record<string, number> };
  brackets: { library: number; custom: number };
  settings: { maxSimulations: number; requireApproval: boolean };
};

const SEASON_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-400",
  active: "bg-emerald-500",
  playoffs: "bg-primary",
  completed: "bg-amber-500",
  archived: "bg-gray-600",
};

const GAME_STATUS_COLORS: Record<string, string> = {
  Scheduled: "bg-blue-500",
  "In Progress": "bg-amber-500",
  Final: "bg-emerald-500",
  Cancelled: "bg-red-500",
  "Home Team Forfeit": "bg-gray-500",
  "Away Team Forfeit": "bg-gray-400",
};

const ROLE_LABELS: Record<string, string> = {
  league_admin: "League Admin",
  division_admin: "Division Admin",
  tournament_admin: "Tournament Admin",
  team_manager: "Team Manager",
  team_parent: "Team Parent",
};

export default function AdminDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load dashboard");
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
        Failed to load dashboard data. {error}
      </div>
    );
  }

  const activeSeasons = (data.seasons.byStatus["active"] || 0) + (data.seasons.byStatus["playoffs"] || 0);
  const gamesThisWeek = data.games.season.thisWeek;
  const gamesToday = data.games.season.today;

  // Alerts
  const alerts: { label: string; count: number; href: string; variant: "amber" | "red" }[] = [];
  if (data.users.inactive > 0) {
    alerts.push({ label: "Pending approvals", count: data.users.inactive, href: "/admin/users", variant: "amber" });
  }
  if (data.scenarios.byStatus["error"]) {
    alerts.push({ label: "Failed scenarios", count: data.scenarios.byStatus["error"], href: "#", variant: "red" });
  }
  if (data.games.season.overdue > 0) {
    alerts.push({ label: "Overdue games", count: data.games.season.overdue, href: "#", variant: "amber" });
  }

  // Active tournament count
  const activeTournaments = Object.entries(data.tournaments.byStatus)
    .filter(([status]) => status.toLowerCase() !== "completed" && status.toLowerCase() !== "archived")
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="space-y-6">
      {/* Tier 1: Hero KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Total Users"
          value={data.users.total}
          accent="blue"
          badge={data.users.inactive > 0 ? { label: `${data.users.inactive} pending`, variant: "amber" } : undefined}
          subtitle={`${data.users.recentSignups} joined this week`}
        />
        <KpiCard
          icon={Trophy}
          label="Active Seasons"
          value={activeSeasons}
          accent="green"
          subtitle={`${data.seasons.total} total across ${data.leagues.total} leagues`}
        />
        <KpiCard
          icon={Swords}
          label="Tournaments"
          value={data.tournaments.total}
          accent="orange"
          badge={activeTournaments > 0 ? { label: `${activeTournaments} active`, variant: "green" } : undefined}
        />
        <KpiCard
          icon={CalendarDays}
          label="Games This Week"
          value={gamesThisWeek}
          accent="purple"
          badge={gamesToday > 0 ? { label: `${gamesToday} today`, variant: "green" } : undefined}
          pulse={gamesToday > 0}
        />
      </div>

      {/* Tier 2: Alert Strip */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.map((alert) => (
            <Link
              key={alert.label}
              href={alert.href}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                alert.variant === "red"
                  ? "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                  : "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {alert.label}
              <span className="font-bold">{alert.count}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Tier 3: Category Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Leagues & Seasons */}
        <CategoryCard
          icon={Building2}
          title="Leagues & Seasons"
          metrics={[
            { label: "Leagues", value: data.leagues.total },
            { label: "Divisions", value: data.leagues.divisions },
            { label: "Seasons", value: data.seasons.total },
            { label: "Active", value: activeSeasons },
          ]}
          href="/leagues"
          linkLabel="View leagues"
        >
          <StatusBar
            segments={Object.entries(data.seasons.byStatus).map(([status, count]) => ({
              label: status.charAt(0).toUpperCase() + status.slice(1),
              value: count,
              color: SEASON_STATUS_COLORS[status] || "bg-gray-400",
            }))}
          />
        </CategoryCard>

        {/* Tournaments */}
        <CategoryCard
          icon={Swords}
          title="Tournaments"
          metrics={[
            { label: "Total", value: data.tournaments.total },
            { label: "Active", value: activeTournaments },
          ]}
          href="/tournaments"
          linkLabel="View tournaments"
        >
          <StatusBar
            segments={Object.entries(data.tournaments.byStatus).map(([status, count]) => ({
              label: status,
              value: count,
              color: status.toLowerCase().includes("complete") ? "bg-emerald-500"
                : status.toLowerCase().includes("active") || status.toLowerCase().includes("progress") ? "bg-amber-500"
                : "bg-blue-500",
            }))}
          />
        </CategoryCard>

        {/* Users & Roles */}
        <CategoryCard
          icon={UserCog}
          title="Users & Roles"
          metrics={[
            { label: "Total Users", value: data.users.total },
            { label: "Active", value: data.users.active },
            { label: "Role Assignments", value: data.roles.total },
            { label: "Pending", value: data.users.inactive },
          ]}
          href="/admin/roles"
          linkLabel="Manage roles"
        >
          {data.roles.total > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(data.roles.byRole).map(([role, count]) => (
                <div key={role} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{ROLE_LABELS[role] || role}</span>
                  <span className="font-medium text-foreground">{count}</span>
                </div>
              ))}
            </div>
          )}
        </CategoryCard>

        {/* Games & Schedule */}
        <CategoryCard
          icon={Gamepad2}
          title="Games & Schedule"
          metrics={[
            { label: "Season Games", value: data.games.season.total },
            { label: "Tournament Games", value: data.games.tournament.total },
            { label: "Today", value: gamesToday },
            { label: "This Week", value: gamesThisWeek },
          ]}
        >
          <StatusBar
            segments={Object.entries(data.games.season.byStatus).map(([status, count]) => ({
              label: status,
              value: count,
              color: GAME_STATUS_COLORS[status] || "bg-gray-400",
            }))}
          />
        </CategoryCard>

        {/* Coaches */}
        <CategoryCard
          icon={Users}
          title="Coaches"
          metrics={[
            { label: "Total Coaches", value: data.coaches.total },
            { label: "Unassigned", value: data.coaches.unassigned },
            { label: "Assigned", value: data.coaches.total - data.coaches.unassigned },
          ]}
          href="/leagues"
          linkLabel="View leagues"
        >
          {data.coaches.total > 0 && (
            <div className="h-2 rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${((data.coaches.total - data.coaches.unassigned) / data.coaches.total) * 100}%` }}
                title={`Assigned: ${data.coaches.total - data.coaches.unassigned}`}
              />
              <div
                className="bg-gray-300 dark:bg-gray-600 transition-all"
                style={{ width: `${(data.coaches.unassigned / data.coaches.total) * 100}%` }}
                title={`Unassigned: ${data.coaches.unassigned}`}
              />
            </div>
          )}
        </CategoryCard>

        {/* System */}
        <CategoryCard
          icon={Settings}
          title="System"
          metrics={[
            { label: "Library Brackets", value: data.brackets.library },
            { label: "Custom Brackets", value: data.brackets.custom },
            { label: "Sim Budget", value: data.settings.maxSimulations.toLocaleString() },
            { label: "Approval Mode", value: data.settings.requireApproval ? "On" : "Off" },
          ]}
          href="/admin/brackets"
          linkLabel="Manage brackets"
        >
          {data.scenarios.total > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="w-3 h-3" />
              <span>{data.scenarios.total} scenarios run</span>
              {data.scenarios.byStatus["error"] && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  ({data.scenarios.byStatus["error"]} failed)
                </span>
              )}
            </div>
          )}
        </CategoryCard>
      </div>
    </div>
  );
}
