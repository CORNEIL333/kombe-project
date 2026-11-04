-- Retour arrière de 0038_notifications_livraison. Refuse de perdre une trace d'envoi.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM notification_outbox WHERE state IN ('sent','dead')) THEN
    RAISE EXCEPTION 'Envois consignés : retour arrière refusé';
  END IF;
  DROP TRIGGER IF EXISTS inbox_notification_outbox ON inbox_notification;
  DROP FUNCTION IF EXISTS kombe_outbox_stats();
  DROP FUNCTION IF EXISTS kombe_push_token_revoke(bigint, timestamptz);
  DROP FUNCTION IF EXISTS kombe_push_register(text, text, timestamptz);
  DROP FUNCTION IF EXISTS kombe_push_tokens(text);
  DROP FUNCTION IF EXISTS kombe_outbox_complete(bigint, text, text, text, timestamptz);
  DROP FUNCTION IF EXISTS kombe_outbox_claim(integer, integer, timestamptz);
  DROP FUNCTION IF EXISTS kombe_outbox_enqueue();
  DROP FUNCTION IF EXISTS kombe_quiet_release(timestamptz, time, time);
  DROP TABLE IF EXISTS notification_outbox;
  DROP TABLE IF EXISTS push_device;
  DROP TABLE IF EXISTS member_notification_preference;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
COMMIT;
