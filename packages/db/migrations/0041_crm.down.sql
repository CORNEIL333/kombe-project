-- Retour arrière de 0041_crm. Refuse de perdre des demandes ou un journal d'audit.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM crm_ticket) OR EXISTS (SELECT 1 FROM crm_audit_log) THEN
    RAISE EXCEPTION 'Demandes ou journal du CRM présents : retour arrière refusé';
  END IF;
  DELETE FROM processing_record WHERE record_id = 'crm-support';
  ALTER TABLE inbox_notification DROP CONSTRAINT IF EXISTS inbox_notification_kind_check;
  ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
    CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                    'aid_decided','order_change','membership','minutes_ready','general','decision',
                    'join_request','admitted','rejected','role_proposed','role_reminder',
                    'statutes_published','statutes_reminder','statutes_excluded','statutes_expired',
                    'cycle_started','meeting_opened','draw_committed','fine_cancelled','aid_requested',
                    'vote_reminder','payout_to_confirm','fund_created','movement_rejected','fine_contested'));
  DROP FUNCTION IF EXISTS kombe_crm_member_rate(text, integer, text);
  DROP FUNCTION IF EXISTS kombe_crm_member_reply(text, text);
  DROP FUNCTION IF EXISTS kombe_crm_member_open(text, text, text, text);
  DROP FUNCTION IF EXISTS kombe_crm_anonymize(integer);
  DROP FUNCTION IF EXISTS kombe_crm_notify_reply(text, bigint);
  DROP FUNCTION IF EXISTS kombe_crm_operators();
  DROP FUNCTION IF EXISTS kombe_crm_contact_names(text[]);
  DROP FUNCTION IF EXISTS kombe_crm_find(text);
  DROP FUNCTION IF EXISTS kombe_crm_reveal(text, text);
  DROP FUNCTION IF EXISTS kombe_crm_contact_card(text);
  DROP FUNCTION IF EXISTS kombe_crm_group_contacts(text);
  DROP FUNCTION IF EXISTS kombe_crm_me();
  DROP TABLE IF EXISTS crm_audit_log, crm_task, crm_note, crm_ticket_message, crm_ticket;
  DROP FUNCTION IF EXISTS kombe_crm_message_immutable();
  DROP FUNCTION IF EXISTS kombe_crm_ticket_sla();
  DROP FUNCTION IF EXISTS kombe_crm_assert_operator();
  DROP SEQUENCE IF EXISTS crm_ticket_ref_seq;
  DROP FUNCTION IF EXISTS kombe_crm_mask(text);
  DROP FUNCTION IF EXISTS kombe_crm_contact_id(text);
  DROP TABLE IF EXISTS crm_contact;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
COMMIT;
