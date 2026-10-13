-- Retour arrière de 0026_product_api.sql (ordre inverse).
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS api_idempotency;
ALTER TABLE IF EXISTS draw DROP CONSTRAINT IF EXISTS draw_sealed_until_reveal;
ALTER TABLE IF EXISTS draw DROP COLUMN IF EXISTS sealed_seed;
DROP INDEX IF EXISTS fund_movement_by_round;
ALTER TABLE IF EXISTS fund_movement DROP COLUMN IF EXISTS round_seq;
ALTER TABLE IF EXISTS membership DROP COLUMN IF EXISTS share_count;

COMMIT;
