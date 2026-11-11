-- KÓMBE — CRM : alertes de délai de service avant dépassement (ITIL). Additif.
--
-- kombe_crm_sla_scan(instant) prévient UNE fois par demande et par échéance :
--   * P1 et P2 : 30 minutes avant l'échéance (première réponse, résolution) ;
--   * P3 et P4 : une fois l'échéance dépassée.
-- Destinataire : le responsable de la demande, sinon les opérateurs support,
-- opérations et admin. Le message ne porte que la référence et l'échéance.
-- Appelée pendant la relève des envois (passage d'un membre, au plus toutes
-- les 5 minutes par instance) et par la tâche quotidienne : aucune nouvelle
-- tâche planifiée. Une demande « en attente du membre » ne relance personne.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

ALTER TABLE inbox_notification DROP CONSTRAINT inbox_notification_kind_check;
ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
  CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                  'aid_decided','order_change','membership','minutes_ready','general','decision',
                  'join_request','admitted','rejected','role_proposed','role_reminder',
                  'statutes_published','statutes_reminder','statutes_excluded','statutes_expired',
                  'cycle_started','meeting_opened','draw_committed','fine_cancelled','aid_requested',
                  'vote_reminder','payout_to_confirm','fund_created','movement_rejected','fine_contested',
                  'support_reply','poll_opened','meeting_updated','fine_refunded','support_request','support_sla'));

CREATE FUNCTION kombe_crm_sla_scan(at_in timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE n integer;
BEGIN
  WITH echeances AS (
    SELECT t.ticket_id, t.ref, t.priority, a.identity_id AS assignee, x.stage, x.due
      FROM public.crm_ticket t
      LEFT JOIN public.crm_contact a ON a.contact_id = t.assignee_contact_id
      CROSS JOIN LATERAL (VALUES
        ('reponse', CASE WHEN t.first_response_at IS NULL THEN t.first_response_due END),
        ('resolution', t.resolution_due)) AS x(stage, due)
     WHERE t.status IN ('nouveau','en_cours') AND x.due IS NOT NULL
       AND x.due <= at_in + CASE WHEN t.priority <= 2 THEN interval '30 minutes' ELSE interval '0' END
  ), destinataires AS (
    SELECT e.*, ia.identity_id AS dest
      FROM echeances e
      JOIN public.identity_access ia ON ia.is_operator AND ia.state = 'active'
     WHERE (e.assignee IS NOT NULL AND ia.identity_id = e.assignee)
        OR (e.assignee IS NULL AND EXISTS (SELECT 1 FROM public.operator_role o
                                           WHERE o.identity_id = ia.identity_id AND o.role IN ('support','operations','admin')))
  ), ins AS (
    INSERT INTO public.inbox_notification (identity_id, group_id, kind, target, dedup_key, params)
    SELECT dest, NULL, 'support_sla', '/crm/#/demandes/' || ticket_id,
           'supportSla:' || ticket_id || ':' || stage,
           jsonb_build_object('ref', ref, 'echeance', stage, 'priorite', priority, 'avant', to_char(due AT TIME ZONE 'Africa/Douala', 'DD/MM HH24:MI'))
      FROM destinataires
    ON CONFLICT (identity_id, dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION kombe_crm_sla_scan(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_crm_sla_scan(timestamptz) TO kombe_app;

COMMIT;
