-- KÓMBE — Rappels automatiques (lot L-15) et cycles successifs d'un groupe.
-- La tâche planifiée doit trouver les séances proches de TOUS les groupes sans
-- lever la RLS : fonction SECURITY DEFINER à sortie minimale (identifiants et
-- date seulement, aucun nom ni montant), même idiome que 0020/0023.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION kombe_upcoming_meetings(today_in date, horizon_in integer)
RETURNS TABLE(group_id text, meeting_id text, scheduled_date date, days_before integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.group_id, m.meeting_id, m.scheduled_date, (m.scheduled_date - today_in)::integer
    FROM public.meeting m
    JOIN public."group" g ON g.group_id = m.group_id
   WHERE m.state = 'planned'
     AND g.state = 'active'
     AND horizon_in BETWEEN 1 AND 7
     AND m.scheduled_date - today_in BETWEEN 1 AND horizon_in
   ORDER BY m.scheduled_date
   LIMIT 5000
$$;
REVOKE ALL ON FUNCTION kombe_upcoming_meetings(date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_upcoming_meetings(date, integer) TO kombe_app;

-- Cycles successifs : un groupe enchaîne les cycles (njangi renouvelé chaque
-- année). Les tours restent numérotés en continu ; chaque cycle borne sa
-- plage de tours, sa version de règles et sa cadence.
CREATE TABLE tontine_cycle (
  group_id      text NOT NULL REFERENCES "group"(group_id),
  cycle_no      integer NOT NULL CHECK (cycle_no >= 1),
  rules_version integer NOT NULL,
  cadence       jsonb NOT NULL CHECK (jsonb_typeof(cadence) = 'object'),
  first_seq     integer NOT NULL CHECK (first_seq >= 1),
  last_seq      integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, cycle_no),
  CHECK (last_seq >= first_seq),
  FOREIGN KEY (group_id, rules_version) REFERENCES rule_version(group_id, rules_version)
);
ALTER TABLE tontine_cycle ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tontine_cycle USING (group_id = current_setting('kombe.group_id', true));
GRANT SELECT, INSERT, UPDATE ON tontine_cycle TO kombe_app;
REVOKE DELETE ON tontine_cycle FROM kombe_app;

COMMIT;
