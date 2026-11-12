-- KÓMBE — Intégrité : résiduels de l'audit (AUDIT_INCOHERENCES §6.3). Additif.
-- 1. Une seule séance ouverte par groupe, garantie par la base : deux
--    ouvertures simultanées ne peuvent plus passer entre la vérification et
--    l'écriture (index unique partiel ; la production n'a aucun doublon, 12/11).
-- 2. Table `command` (socle, inutilisée par l'API produit) : RLS par groupe,
--    comme les autres tables du registre.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE UNIQUE INDEX meeting_one_open_per_group ON meeting (group_id) WHERE state = 'open';

ALTER TABLE command ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON command
  USING (group_id = current_setting('kombe.group_id', true))
  WITH CHECK (group_id = current_setting('kombe.group_id', true));

COMMIT;
