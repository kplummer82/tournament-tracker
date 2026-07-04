-- Remove USPS address verification.
-- The USPS Address Validation API was pulled out (app doesn't mail; addresses
-- come from Mapbox typeahead). This drops the now-unused verification flag.
-- Idempotent: safe to run on already-provisioned branches and a no-op on a
-- fresh build where the column is never created.
ALTER TABLE locations DROP COLUMN IF EXISTS usps_verified;

-- Drop the stale admin kill-switch setting (nothing reads it anymore).
DELETE FROM app_settings WHERE key = 'usps_enabled';
