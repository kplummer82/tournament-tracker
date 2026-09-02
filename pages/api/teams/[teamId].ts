import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from '@/lib/db';
import { requireTeamAccess } from '@/lib/auth/requireSession';
import { parseTeamLocation, teamLocationLabel } from '@/lib/teams/location';

export type TeamDetail = {
  id: number;
  name: string | null;
  division: string | null;
  season: string | null;
  year: number | null;
  sport: string | null;
  sport_id: number | null;
  league_id: number | null;
  league_name: string | null;
  league_division_id: number | null;
  league_division_name: string | null;
  notes: string | null;
  location_type: 'home_field' | 'city' | null;
  home_location_id: number | null;
  home_location_name: string | null;
  /** Effective city — the team's own, or the home field's. */
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
};

export type TeamTournament = {
  tournamentid: number;
  name: string | null;
  year: number | null;
  division: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { teamId } = req.query;
  const id = Number(teamId);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid teamId' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const teamRows = (await sql`
        SELECT
          t.teamid              AS id,
          t.name                AS name,
          d.division            AS division,
          t.season              AS season,
          t.year                AS year,
          s.sportname           AS sport,
          t.sportid             AS sport_id,
          t.league_id           AS league_id,
          l.name                AS league_name,
          t.league_division_id  AS league_division_id,
          ld.name               AS league_division_name,
          t.notes               AS notes,
          t.location_type       AS location_type,
          t.home_location_id    AS home_location_id,
          hl.name               AS home_location_name,
          COALESCE(t.city,      hl.city)      AS city,
          COALESCE(t.state,     hl.state)     AS state,
          COALESCE(t.latitude,  hl.latitude)  AS latitude,
          COALESCE(t.longitude, hl.longitude) AS longitude
        FROM teams t
        LEFT JOIN divisions        d  ON d.id  = t.division
        LEFT JOIN sport            s  ON s.id  = t.sportid
        LEFT JOIN leagues          l  ON l.id  = t.league_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        LEFT JOIN locations        hl ON hl.id = t.home_location_id
        WHERE t.teamid = ${id}
        LIMIT 1
      `) as TeamDetail[];

      if (!teamRows?.length) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      const tournamentRows = (await sql`
        SELECT
          tour.tournamentid AS tournamentid,
          tour.name         AS name,
          tour.year         AS year,
          d.division        AS division
        FROM tournamentteams tt
        JOIN tournaments tour ON tour.tournamentid = tt.tournamentid
        LEFT JOIN divisions d ON d.id = tour.division
        WHERE tt.teamid = ${id}
        ORDER BY tour.year DESC NULLS LAST, tour.name ASC
      `) as TeamTournament[];

      const team: TeamDetail = {
        id: teamRows[0].id,
        name: teamRows[0].name ?? null,
        division: teamRows[0].division ?? null,
        season: teamRows[0].season ?? null,
        year: teamRows[0].year != null ? Number(teamRows[0].year) : null,
        sport: teamRows[0].sport ?? null,
        sport_id: teamRows[0].sport_id ?? null,
        league_id: teamRows[0].league_id ?? null,
        league_name: teamRows[0].league_name ?? null,
        league_division_id: teamRows[0].league_division_id ?? null,
        league_division_name: teamRows[0].league_division_name ?? null,
        notes: teamRows[0].notes ?? null,
        location_type: teamRows[0].location_type ?? null,
        home_location_id: teamRows[0].home_location_id ?? null,
        home_location_name: teamRows[0].home_location_name ?? null,
        city: teamRows[0].city ?? null,
        state: teamRows[0].state ?? null,
        latitude: teamRows[0].latitude != null ? Number(teamRows[0].latitude) : null,
        longitude: teamRows[0].longitude != null ? Number(teamRows[0].longitude) : null,
        location_label: teamLocationLabel(teamRows[0]),
      };

      const tournaments: TeamTournament[] = tournamentRows.map((r) => ({
        tournamentid: r.tournamentid,
        name: r.name ?? null,
        year: r.year != null ? Number(r.year) : null,
        division: r.division ?? null,
      }));

      res.status(200).json({ team, tournaments });
      return;
    }

    if (req.method === 'PATCH') {
      const session = await requireTeamAccess(req, res, id);
      if (!session) return;

      const body = req.body ?? {};
      const { name, divisionId, season, year, sportId, leagueId, leagueDivisionId, notes } = body;
      const hasLeagueId = 'leagueId' in body;
      const hasLeagueDivisionId = 'leagueDivisionId' in body;
      const hasNotes = 'notes' in body;
      const notesValue =
        typeof notes === 'string' && notes.trim() !== '' ? notes.trim() : null;

      // Omitting `locationType` leaves the location untouched; sending it null
      // clears it. Either way all six columns move together so the two shapes
      // can never mix (see the teams_location_shape CHECK).
      const parsedLocation = parseTeamLocation(body);
      if (parsedLocation.error) {
        res.status(400).json({ error: parsedLocation.error });
        return;
      }
      const location = parsedLocation.value;
      const hasLocation = location !== null;

      const updated = await sql`
        UPDATE teams
        SET
          name      = COALESCE(${name ?? null}, name),
          division  = COALESCE(${divisionId != null ? Number(divisionId) : null}::int, division),
          season    = COALESCE(${season ?? null}, season),
          year      = COALESCE(${year != null ? Number(year) : null}::int, year),
          sportid   = COALESCE(${sportId != null ? Number(sportId) : null}::int, sportid),
          league_id = CASE WHEN ${hasLeagueId}
                        THEN ${leagueId != null ? Number(leagueId) : null}::int
                        ELSE league_id
                      END,
          league_division_id = CASE WHEN ${hasLeagueDivisionId}
                        THEN ${leagueDivisionId != null ? Number(leagueDivisionId) : null}::int
                        ELSE league_division_id
                      END,
          notes = CASE WHEN ${hasNotes}
                        THEN ${notesValue}::text
                        ELSE notes
                      END,
          location_type = CASE WHEN ${hasLocation}
                        THEN ${location?.locationType ?? null}::text
                        ELSE location_type
                      END,
          home_location_id = CASE WHEN ${hasLocation}
                        THEN ${location?.homeLocationId ?? null}::int
                        ELSE home_location_id
                      END,
          city = CASE WHEN ${hasLocation}
                        THEN ${location?.city ?? null}::text
                        ELSE city
                      END,
          state = CASE WHEN ${hasLocation}
                        THEN ${location?.state ?? null}::text
                        ELSE state
                      END,
          latitude = CASE WHEN ${hasLocation}
                        THEN ${location?.latitude ?? null}::numeric
                        ELSE latitude
                      END,
          longitude = CASE WHEN ${hasLocation}
                        THEN ${location?.longitude ?? null}::numeric
                        ELSE longitude
                      END
        WHERE teamid = ${id}
        RETURNING teamid AS id
      `;

      if (updated.length === 0) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      res.status(200).json({ id: updated[0].id });
      return;
    }

    if (req.method === 'DELETE') {
      const session = await requireTeamAccess(req, res, id);
      if (!session) return;

      // First unlink from tournaments
      await sql`
        DELETE FROM tournamentteams WHERE teamid = ${id}
      `;

      const deleted = await sql`
        DELETE FROM teams
        WHERE teamid = ${id}
        RETURNING teamid AS id
      `;

      if (deleted.length === 0) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Server error', detail: err?.message });
  }
}
