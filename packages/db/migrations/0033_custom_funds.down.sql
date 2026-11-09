-- Retour arrière de 0033_custom_funds. Refuse de détruire des caisses
-- personnalisées existantes : le registre est en ajout seul.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM fund WHERE kind = 'custom') THEN
    RAISE EXCEPTION 'Caisses personnalisées présentes : retour arrière refusé';
  END IF;
  ALTER TABLE fund DROP CONSTRAINT IF EXISTS fund_kind_check;
  ALTER TABLE fund ADD CONSTRAINT fund_kind_check
    CHECK (kind IN ('rotation','solidarity','year_end_reserve','operating','fines','loan','collector'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;
COMMIT;
