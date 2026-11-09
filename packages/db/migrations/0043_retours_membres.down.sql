-- Retour arrière de 0043_retours_membres (tolérant sur base partielle).
BEGIN;
DROP INDEX IF EXISTS fine_refund_due;
ALTER TABLE IF EXISTS fine DROP CONSTRAINT IF EXISTS fine_refunded_settles;
ALTER TABLE IF EXISTS fine DROP CONSTRAINT IF EXISTS fine_refund_only_cancelled_paid;
ALTER TABLE IF EXISTS fine DROP CONSTRAINT IF EXISTS fine_refund_movement_fk;
ALTER TABLE IF EXISTS fine DROP COLUMN IF EXISTS refunded_at;
ALTER TABLE IF EXISTS fine DROP COLUMN IF EXISTS refund_movement_id;
ALTER TABLE IF EXISTS fine DROP COLUMN IF EXISTS refund_due;

DO $$ BEGIN
  DELETE FROM inbox_notification WHERE kind IN ('poll_opened','meeting_updated','fine_refunded');
  ALTER TABLE inbox_notification DROP CONSTRAINT IF EXISTS inbox_notification_kind_check;
  ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
    CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                    'aid_decided','order_change','membership','minutes_ready','general','decision',
                    'join_request','admitted','rejected','role_proposed','role_reminder',
                    'statutes_published','statutes_reminder','statutes_excluded','statutes_expired',
                    'cycle_started','meeting_opened','draw_committed','fine_cancelled','aid_requested',
                    'vote_reminder','payout_to_confirm','fund_created','movement_rejected','fine_contested',
                    'support_reply'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DROP TABLE IF EXISTS poll_ballot;
DROP TABLE IF EXISTS poll;
DROP FUNCTION IF EXISTS poll_ballot_guard();
DROP FUNCTION IF EXISTS poll_state_guard();

ALTER TABLE IF EXISTS meeting DROP CONSTRAINT IF EXISTS meeting_online_url_only_online;
ALTER TABLE IF EXISTS meeting DROP COLUMN IF EXISTS online_url;
ALTER TABLE IF EXISTS meeting DROP COLUMN IF EXISTS format;
COMMIT;
