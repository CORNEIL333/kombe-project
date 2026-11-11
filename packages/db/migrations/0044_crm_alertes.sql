-- KÓMBE — CRM : le support est prévenu des demandes des membres (ADR-0046). Additif.
--
-- Une demande ouverte depuis l'application, ou une réponse du membre, arrive
-- dans la boîte de réception des opérateurs concernés. Le délai de première
-- réponse (ITIL) ne dépend donc plus de quelqu'un qui surveille la file.
--   * nouvelle demande        → opérateurs support, opérations, admin actifs ;
--   * réponse du membre       → le responsable de la demande s'il y en a un,
--                               sinon les mêmes opérateurs.
-- Le message ne porte que la référence (KMB-…) : ni l'objet, ni le texte.
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
                  'support_reply','poll_opened','meeting_updated','fine_refunded','support_request'));

/* Prévenir les opérateurs : `seulement_responsable` réduit à la personne assignée. */
CREATE FUNCTION kombe_crm_alert_operators(ticket_in text, message_in bigint, motif_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r text; assignee text;
BEGIN
  SELECT t.ref, c.identity_id INTO r, assignee
    FROM public.crm_ticket t LEFT JOIN public.crm_contact c ON c.contact_id = t.assignee_contact_id
   WHERE t.ticket_id = ticket_in;
  IF r IS NULL THEN RETURN; END IF;
  INSERT INTO public.inbox_notification (identity_id, group_id, kind, target, dedup_key, params)
  SELECT a.identity_id, NULL, 'support_request', '/crm/#/demandes/' || ticket_in,
         'supportRequest:' || ticket_in || ':' || message_in, jsonb_build_object('ref', r, 'motif', motif_in)
    FROM public.identity_access a
   WHERE a.is_operator AND a.state = 'active'
     AND (CASE WHEN motif_in = 'reponse' AND assignee IS NOT NULL THEN a.identity_id = assignee
               ELSE EXISTS (SELECT 1 FROM public.operator_role o WHERE o.identity_id = a.identity_id AND o.role IN ('support','operations','admin')) END)
     AND a.identity_id <> current_setting('kombe.identity_id', true)
  ON CONFLICT (identity_id, dedup_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION kombe_crm_alert_operators(text, bigint, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kombe_crm_member_open(subject_in text, category_in text, body_in text, group_in text)
RETURNS TABLE (ticket_id text, ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me text := current_setting('kombe.identity_id', true); cid text; tid text; r text; mid bigint;
BEGIN
  IF me IS NULL OR me = '' THEN RAISE EXCEPTION 'session requise' USING ERRCODE = '42501'; END IF;
  IF group_in IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.membership m WHERE m.group_id = group_in AND m.identity_id = me) THEN
    RAISE EXCEPTION 'groupe inconnu' USING ERRCODE = '42501';
  END IF;
  cid := kombe_crm_contact_id(me);
  IF (SELECT count(*) FROM public.crm_ticket t WHERE t.requester_contact_id = cid AND t.status IN ('nouveau','en_cours','attente_membre')) >= 5 THEN
    RAISE EXCEPTION 'cinq demandes ouvertes au plus' USING ERRCODE = '23514';
  END IF;
  tid := 'tk_' || substr(md5(random()::text || clock_timestamp()::text || me), 1, 20);
  r := 'KMB-' || lpad(nextval('public.crm_ticket_ref_seq')::text, 6, '0');
  INSERT INTO public.crm_ticket (ticket_id, ref, requester_contact_id, group_id, subject, category, channel, urgency)
  VALUES (tid, r, cid, group_in, btrim(subject_in), category_in, 'application',
          CASE WHEN category_in IN ('connexion','cotisation','remise') THEN 2 ELSE 3 END);
  INSERT INTO public.crm_ticket_message (ticket_id, author_kind, author_contact_id, visibility, body)
  VALUES (tid, 'membre', cid, 'public', btrim(body_in)) RETURNING message_id INTO mid;
  PERFORM kombe_crm_alert_operators(tid, mid, 'nouvelle');
  RETURN QUERY SELECT tid, r;
END $$;

CREATE OR REPLACE FUNCTION kombe_crm_member_reply(ticket_in text, body_in text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me text := current_setting('kombe.identity_id', true); cid text; st text; mid bigint;
BEGIN
  cid := (SELECT c.contact_id FROM public.crm_contact c WHERE c.identity_id = me);
  SELECT t.status INTO st FROM public.crm_ticket t WHERE t.ticket_id = ticket_in AND t.requester_contact_id = cid FOR UPDATE;
  IF st IS NULL THEN RAISE EXCEPTION 'demande inconnue' USING ERRCODE = '42501'; END IF;
  IF st = 'ferme' THEN RAISE EXCEPTION 'demande close : ouvrez-en une nouvelle' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.crm_ticket_message (ticket_id, author_kind, author_contact_id, visibility, body)
  VALUES (ticket_in, 'membre', cid, 'public', btrim(body_in)) RETURNING message_id INTO mid;
  IF st IN ('attente_membre','resolu') THEN UPDATE public.crm_ticket SET status = 'en_cours' WHERE ticket_id = ticket_in; END IF;
  PERFORM kombe_crm_alert_operators(ticket_in, mid, 'reponse');
  RETURN mid;
END $$;

COMMIT;
