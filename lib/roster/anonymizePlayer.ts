// Anonymize a player's personal information in place (COPPA deletion).
//
// This is the reusable core: it runs inside the caller's transaction (it takes
// a checked-out pool.connect() client, mirroring lib/locations/applySuggestion
// .ts) and is deliberately auth-agnostic — the calling endpoint decides who is
// allowed and passes the actor in. That lets a future parent-driven self-serve
// flow reuse it verbatim.
//
// The child's identity lives only on team_roster; every downstream table holds
// just roster_id and joins back for the name/jersey, so overwriting this one
// row propagates everywhere. jersey_number is intentionally preserved.

/** node-postgres-compatible client (a checked-out pool.connect() client). */
export type Queryable = {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
};

export type AnonymizedRoster = {
  id: number;
  teamid: number;
  first_name: string;
  last_name: string | null;
  role: "player" | "staff";
  jersey_number: number | null;
  hat_monogram: string | null;
  walkup_song: string | null;
  walkup_song_itunes_id: number | null;
  deleted_at: string | null;
};

export type AnonymizeInput = {
  rosterId: number;
  teamId: number;
  deletedBy: string | null;
  deletedByName?: string | null;
  requestedBy?: string | null;
  reason?: string | null;
  /**
   * Optional shared id grouping every row anonymized in one bulk request, so a
   * cross-team deletion is auditable as a single event. Single-team callers
   * leave it undefined and the log row's request_id stays NULL.
   */
  requestId?: string | null;
};

/**
 * Overwrite the player's PII and write an audit-log row, atomically within the
 * caller's transaction.
 *
 * Idempotent: the `deleted_at IS NULL` guard means a second call finds no row
 * and returns { alreadyDeleted: true } without writing a duplicate log row.
 * A missing/mismatched roster row returns { notFound: true }.
 */
export async function anonymizePlayer(
  client: Queryable,
  input: AnonymizeInput
): Promise<
  | { ok: true; player: AnonymizedRoster }
  | { alreadyDeleted: true }
  | { notFound: true }
> {
  const { rosterId, teamId, deletedBy, deletedByName, requestedBy, reason, requestId } = input;

  const updated = await client.query(
    `UPDATE public.team_roster
     SET first_name           = 'Deleted Player ' || id::text,
         last_name            = NULL,
         hat_monogram          = NULL,
         walkup_song           = NULL,
         walkup_song_itunes_id = NULL,
         deleted_at            = NOW(),
         deleted_by            = $3
     WHERE id = $1 AND teamid = $2 AND deleted_at IS NULL
     RETURNING id, teamid, first_name, last_name, role, jersey_number,
               hat_monogram, walkup_song, walkup_song_itunes_id, deleted_at`,
    [rosterId, teamId, deletedBy]
  );

  if (!updated.rows.length) {
    // Either the row doesn't exist for this team, or it's already anonymized.
    const exists = await client.query(
      `SELECT deleted_at FROM public.team_roster WHERE id = $1 AND teamid = $2`,
      [rosterId, teamId]
    );
    if (!exists.rows.length) return { notFound: true };
    return { alreadyDeleted: true };
  }

  await client.query(
    `INSERT INTO public.player_deletion_log
       (roster_id, teamid, deleted_by, deleted_by_name, requested_by, reason, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [rosterId, teamId, deletedBy, deletedByName ?? null, requestedBy ?? null, reason ?? null, requestId ?? null]
  );

  return { ok: true, player: updated.rows[0] as AnonymizedRoster };
}
