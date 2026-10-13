-- Retour arrière de 0030_decisions (tolérant sur base partielle).
BEGIN;
DROP TABLE IF EXISTS decision_ballot;
DROP TABLE IF EXISTS group_decision;
DROP FUNCTION IF EXISTS decision_ballot_guard();
DROP FUNCTION IF EXISTS group_decision_state_guard();
DO $$ BEGIN DELETE FROM inbox_notification WHERE kind = 'decision'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
ALTER TABLE IF EXISTS inbox_notification DROP CONSTRAINT IF EXISTS inbox_notification_kind_check;
ALTER TABLE IF EXISTS inbox_notification ADD CONSTRAINT inbox_notification_kind_check
  CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                  'aid_decided','order_change','membership','minutes_ready','general'));
DO $$ BEGIN
  UPDATE fund_movement SET channel = 'other' WHERE channel = 'international_transfer';
  ALTER TABLE fund_movement DROP CONSTRAINT IF EXISTS fund_movement_channel_check;
  ALTER TABLE fund_movement ADD CONSTRAINT fund_movement_channel_check
    CHECK (channel IN ('cash','orange_money','mtn_momo','bank','other'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;
ALTER TABLE IF EXISTS membership DROP CONSTRAINT IF EXISTS membership_share_partner_not_self;
ALTER TABLE IF EXISTS membership DROP CONSTRAINT IF EXISTS membership_share_partner_fk;
ALTER TABLE IF EXISTS membership DROP COLUMN IF EXISTS share_partner_membership_id;
ALTER TABLE IF EXISTS share_holder DROP CONSTRAINT IF EXISTS share_holder_range;
ALTER TABLE IF EXISTS share_holder DROP COLUMN IF EXISTS until_seq;
ALTER TABLE IF EXISTS share_holder DROP COLUMN IF EXISTS from_seq;
COMMIT;
