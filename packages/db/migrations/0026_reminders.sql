-- KÓMBE — Rappels automatiques (lot L-15, innovation « rappels sans effort »).
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

COMMIT;
