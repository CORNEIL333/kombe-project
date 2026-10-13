-- Retour arrière de 0031_cycles_reserve (tolérant sur base partielle).
BEGIN;
DROP INDEX IF EXISTS fund_movement_one_reserve_share;
DO $$ BEGIN
  UPDATE fund_movement SET related_kind = NULL WHERE related_kind = 'reserve';
  ALTER TABLE fund_movement DROP CONSTRAINT IF EXISTS fund_movement_related_kind_check;
  ALTER TABLE fund_movement ADD CONSTRAINT fund_movement_related_kind_check
    CHECK (related_kind IS NULL OR related_kind IN ('fine','aid','debt','payout','advance','loan','collector','transfer'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DROP TABLE IF EXISTS tontine_cycle;
COMMIT;
