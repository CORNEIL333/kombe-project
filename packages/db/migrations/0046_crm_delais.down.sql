-- Retour arrière de 0046_crm_delais : plus d'alerte de délai (demandes intactes).
BEGIN;
DROP FUNCTION IF EXISTS kombe_crm_sla_scan(timestamptz);
DO $$ BEGIN
  DELETE FROM inbox_notification WHERE kind = 'support_sla';
  ALTER TABLE inbox_notification DROP CONSTRAINT IF EXISTS inbox_notification_kind_check;
  ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
    CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                    'aid_decided','order_change','membership','minutes_ready','general','decision',
                    'join_request','admitted','rejected','role_proposed','role_reminder',
                    'statutes_published','statutes_reminder','statutes_excluded','statutes_expired',
                    'cycle_started','meeting_opened','draw_committed','fine_cancelled','aid_requested',
                    'vote_reminder','payout_to_confirm','fund_created','movement_rejected','fine_contested',
                    'support_reply','poll_opened','meeting_updated','fine_refunded','support_request'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;
COMMIT;
