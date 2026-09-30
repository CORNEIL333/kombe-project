-- Retour arrière technique : arrêter les workers et archiver les alertes/traces
-- avant exécution ; les données C13 sont retirées, le journal n'est pas modifié.
BEGIN;
DROP TRIGGER IF EXISTS journal_c13_outbox ON journal;
DROP FUNCTION IF EXISTS kombe_c13_enqueue();
DROP FUNCTION IF EXISTS kombe_c13_dispatch_rights(text,text),kombe_c13_replay_rights(text,text);
DROP TABLE IF EXISTS notification_delivery,internal_notification,notification_preference,notification_channel;
DROP FUNCTION IF EXISTS kombe_c13_trace_immutable();
DROP POLICY IF EXISTS c13_worker_tenant ON outbox;
DROP POLICY IF EXISTS c13_app_legacy ON outbox;
ALTER TABLE outbox DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS outbox_dispatch_idx;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='outbox' AND column_name='state') THEN
   DELETE FROM outbox WHERE state <> 'legacy';
 END IF;
END $$;
ALTER TABLE outbox DROP CONSTRAINT IF EXISTS outbox_c13_group_id_unique, DROP CONSTRAINT IF EXISTS outbox_delivery_unique, DROP CONSTRAINT IF EXISTS outbox_journal_fk,
 DROP CONSTRAINT IF EXISTS outbox_attempts_budget, DROP CONSTRAINT IF EXISTS outbox_c13_complete, DROP CONSTRAINT IF EXISTS outbox_lease_complete,
 DROP COLUMN IF EXISTS group_id, DROP COLUMN IF EXISTS event_seq, DROP COLUMN IF EXISTS event_ref,
 DROP COLUMN IF EXISTS recipient, DROP COLUMN IF EXISTS channel, DROP COLUMN IF EXISTS notification_type,
 DROP COLUMN IF EXISTS state, DROP COLUMN IF EXISTS attempts, DROP COLUMN IF EXISTS attempts_max,
 DROP COLUMN IF EXISTS available_at, DROP COLUMN IF EXISTS expires_at, DROP COLUMN IF EXISTS locked_by,
 DROP COLUMN IF EXISTS locked_until, DROP COLUMN IF EXISTS lease_token, DROP COLUMN IF EXISTS replay_count;
ALTER TABLE journal DROP CONSTRAINT IF EXISTS journal_c13_ref_unique;
-- Rétablir seulement les privilèges du socle que C13 avait élargis.

COMMIT;
