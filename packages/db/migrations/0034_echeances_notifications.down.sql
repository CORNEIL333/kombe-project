-- Retour arrière de 0034_echeances_notifications. Refuse de perdre des
-- échéances posées ou des notifications des nouveaux types.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM statutes_deadline) THEN
    RAISE EXCEPTION 'Échéances de statuts présentes : retour arrière refusé';
  END IF;
  IF EXISTS (SELECT 1 FROM inbox_notification WHERE kind NOT IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                  'aid_decided','order_change','membership','minutes_ready','general','decision')) THEN
    RAISE EXCEPTION 'Notifications des nouveaux types présentes : retour arrière refusé';
  END IF;
  DROP FUNCTION IF EXISTS kombe_groups_to_process();
  DROP FUNCTION IF EXISTS kombe_notify_v2(text, text, text, text, text, jsonb);
  ALTER TABLE inbox_notification DROP CONSTRAINT IF EXISTS inbox_notification_kind_check;
  ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
    CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                    'aid_decided','order_change','membership','minutes_ready','general','decision'));
  ALTER TABLE inbox_notification DROP COLUMN IF EXISTS params;
  DROP TABLE IF EXISTS statutes_deadline;
  ALTER TABLE role_assignment DROP COLUMN IF EXISTS proposed_at;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
COMMIT;
