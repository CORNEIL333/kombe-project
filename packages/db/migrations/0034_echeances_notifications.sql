-- KÓMBE — Échéance d'acceptation des statuts et notifications détaillées
-- (retours terrain, 2026-10-20 ; ADR-0042). Additif.
--
-- 1. statutes_deadline : le bureau fixe une date limite d'acceptation de
--    chaque version des statuts et ce qui arrive aux retardataires
--    (exclusion avant démarrage, ou simple signalement). Prolongeable.
-- 2. inbox_notification.params : détail lisible APRÈS authentification
--    (échéance, n° de tour, nom du groupe…) ; nouveaux types précis au lieu
--    de « general » / « membership » fourre-tout.
-- 3. kombe_notify_v2 : même garde que kombe_notify, avec le détail, et la
--    possibilité de prévenir la personne dont la demande est refusée ou qui
--    vient d'être exclue (état « revoked »).
-- 4. kombe_groups_to_process() : liste des groupes vivants pour la tâche
--    planifiée quotidienne (relances, échéances) — aucune donnée de groupe.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE statutes_deadline (
  group_id           text NOT NULL,
  version            integer NOT NULL,
  deadline_at        timestamptz NOT NULL,
  acceptance_days    integer NOT NULL CHECK (acceptance_days BETWEEN 1 AND 60),
  on_expiry          text NOT NULL CHECK (on_expiry IN ('exclude','keep')),
  set_by_identity_id text NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, version),
  FOREIGN KEY (group_id, version) REFERENCES statutes_version(group_id, version)
);
ALTER TABLE statutes_deadline ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON statutes_deadline USING (group_id = current_setting('kombe.group_id', true));
GRANT SELECT, INSERT, UPDATE ON statutes_deadline TO kombe_app;
REVOKE DELETE ON statutes_deadline FROM kombe_app;

-- Date de proposition d'une fonction (relance de qui n'a pas encore accepté).
ALTER TABLE role_assignment ADD COLUMN proposed_at timestamptz DEFAULT now();

ALTER TABLE inbox_notification ADD COLUMN params jsonb
  CHECK (params IS NULL OR (jsonb_typeof(params) = 'object' AND pg_column_size(params) <= 2000));
ALTER TABLE inbox_notification DROP CONSTRAINT inbox_notification_kind_check;
ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
  CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                  'aid_decided','order_change','membership','minutes_ready','general','decision',
                  'join_request','admitted','rejected','role_proposed','role_reminder',
                  'statutes_published','statutes_reminder','statutes_excluded','statutes_expired',
                  'cycle_started','meeting_opened','draw_committed','fine_cancelled','aid_requested',
                  'vote_reminder','payout_to_confirm','fund_created','movement_rejected','fine_contested'));

CREATE FUNCTION kombe_notify_v2(identity_in text, group_in text, kind_in text, target_in text, dedup_in text, params_in jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.inbox_notification (identity_id, group_id, kind, target, dedup_key, params)
  SELECT identity_in, group_in, kind_in, target_in, dedup_in, params_in
  WHERE group_in = current_setting('kombe.group_id', true)
    AND EXISTS (SELECT 1 FROM public.membership m
                 WHERE m.group_id = group_in AND m.identity_id = identity_in
                   AND (m.state IN ('active','pending')
                        OR (m.state = 'revoked' AND kind_in IN ('rejected','statutes_excluded'))))
  ON CONFLICT (identity_id, dedup_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION kombe_notify_v2(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_notify_v2(text, text, text, text, text, jsonb) TO kombe_app;

-- Groupes vivants (identifiants seulement) pour la tâche planifiée : chaque
-- groupe est ensuite traité sous sa propre portée RLS (kombe.group_id).
CREATE FUNCTION kombe_groups_to_process()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT g.group_id FROM public."group" g
   WHERE g.settings IS NOT NULL AND g.state IN ('configuration','active','paused')
   ORDER BY g.group_id
$$;
REVOKE ALL ON FUNCTION kombe_groups_to_process() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_groups_to_process() TO kombe_app;

COMMIT;
