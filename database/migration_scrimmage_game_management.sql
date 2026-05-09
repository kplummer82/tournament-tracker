-- Allow 'scrimmage' as a valid game_source in the three game management tables.
-- Run on: dev branch, LDQA branch.
ALTER TABLE game_confirmations
  DROP CONSTRAINT IF EXISTS game_confirmations_game_source_check,
  ADD CONSTRAINT game_confirmations_game_source_check
    CHECK (game_source IN ('season', 'tournament', 'scrimmage'));

ALTER TABLE game_batting_order
  DROP CONSTRAINT IF EXISTS game_batting_order_game_source_check,
  ADD CONSTRAINT game_batting_order_game_source_check
    CHECK (game_source IN ('season', 'tournament', 'scrimmage'));

ALTER TABLE game_defensive_lineup
  DROP CONSTRAINT IF EXISTS game_defensive_lineup_game_source_check,
  ADD CONSTRAINT game_defensive_lineup_game_source_check
    CHECK (game_source IN ('season', 'tournament', 'scrimmage'));
