-- Retour arrière de 0044_crm_alertes : fonctions des membres telles qu'en 0041,
-- alertes des opérateurs retirées (aucune demande ni message touché).
BEGIN;
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION kombe_crm_member_open(subject_in text, category_in text, body_in text, group_in text)
  RETURNS TABLE (ticket_id text, ref text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
  DECLARE me text := current_setting('kombe.identity_id', true); cid text; tid text; r text;
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
    VALUES (tid, 'membre', cid, 'public', btrim(body_in));
    RETURN QUERY SELECT tid, r;
  END $f$;

  CREATE OR REPLACE FUNCTION kombe_crm_member_reply(ticket_in text, body_in text) RETURNS bigint
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
  DECLARE me text := current_setting('kombe.identity_id', true); cid text; st text; mid bigint;
  BEGIN
    cid := (SELECT c.contact_id FROM public.crm_contact c WHERE c.identity_id = me);
    SELECT t.status INTO st FROM public.crm_ticket t WHERE t.ticket_id = ticket_in AND t.requester_contact_id = cid FOR UPDATE;
    IF st IS NULL THEN RAISE EXCEPTION 'demande inconnue' USING ERRCODE = '42501'; END IF;
    IF st = 'ferme' THEN RAISE EXCEPTION 'demande close : ouvrez-en une nouvelle' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.crm_ticket_message (ticket_id, author_kind, author_contact_id, visibility, body)
    VALUES (ticket_in, 'membre', cid, 'public', btrim(body_in)) RETURNING message_id INTO mid;
    IF st IN ('attente_membre','resolu') THEN UPDATE public.crm_ticket SET status = 'en_cours' WHERE ticket_id = ticket_in; END IF;
    RETURN mid;
  END $f$;

  DELETE FROM inbox_notification WHERE kind = 'support_request';
  ALTER TABLE inbox_notification DROP CONSTRAINT IF EXISTS inbox_notification_kind_check;
  ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
    CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                    'aid_decided','order_change','membership','minutes_ready','general','decision',
                    'join_request','admitted','rejected','role_proposed','role_reminder',
                    'statutes_published','statutes_reminder','statutes_excluded','statutes_expired',
                    'cycle_started','meeting_opened','draw_committed','fine_cancelled','aid_requested',
                    'vote_reminder','payout_to_confirm','fund_created','movement_rejected','fine_contested',
                    'support_reply','poll_opened','meeting_updated','fine_refunded'));
EXCEPTION WHEN undefined_table OR undefined_function THEN NULL; END $$;
DROP FUNCTION IF EXISTS kombe_crm_alert_operators(text, bigint, text);
COMMIT;
