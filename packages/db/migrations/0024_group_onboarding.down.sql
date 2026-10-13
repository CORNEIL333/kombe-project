-- KÓMBE — DÉMONTAGE de la migration 0024_group_onboarding.sql (ordre inverse).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS sponsorship;
DROP INDEX IF EXISTS group_parent_idx;

ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS join_code;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS is_discoverable;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS parent_group_id;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS required_independent_roles;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS minimum_members;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS timezone;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS currency;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS rotation_type;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS tontine_model;
ALTER TABLE IF EXISTS "group" DROP COLUMN IF EXISTS display_name;

COMMIT;
