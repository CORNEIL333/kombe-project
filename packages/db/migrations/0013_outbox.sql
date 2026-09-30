-- C13 : socle outbox conservé ; lignes historiques non distribuées implicitement.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='kombe_worker') THEN
    CREATE ROLE kombe_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
ALTER TABLE journal ADD CONSTRAINT journal_c13_ref_unique UNIQUE(group_id,seq,hash);
ALTER TABLE outbox
  ADD COLUMN group_id text,
  ADD COLUMN event_seq bigint,
  ADD COLUMN event_ref text CHECK (event_ref ~ '^[0-9a-f]{64}$'),
  ADD COLUMN recipient text REFERENCES identity(identity_id),
  ADD COLUMN channel text CHECK (channel IN ('internal','push')),
  ADD COLUMN notification_type text,
  ADD COLUMN state text NOT NULL DEFAULT 'legacy' CHECK (state IN ('legacy','pending','leased','retry','ambiguous','delivered','suppressed','expired','dead')),
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  ADD COLUMN attempts_max integer NOT NULL DEFAULT 5 CHECK (attempts_max BETWEEN 1 AND 5),
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN locked_by text,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN lease_token text,
  ADD COLUMN replay_count integer NOT NULL DEFAULT 0 CHECK (replay_count BETWEEN 0 AND 3),
  ADD CONSTRAINT outbox_journal_fk FOREIGN KEY (group_id,event_seq,event_ref) REFERENCES journal(group_id,seq,hash),
  ADD CONSTRAINT outbox_c13_group_id_unique UNIQUE(group_id,outbox_id),
  ADD CONSTRAINT outbox_delivery_unique UNIQUE (event_ref,recipient,channel,notification_type),
  ADD CONSTRAINT outbox_c13_complete CHECK (state='legacy' OR
    (group_id IS NOT NULL AND event_seq IS NOT NULL AND event_ref IS NOT NULL AND recipient IS NOT NULL
     AND channel IS NOT NULL AND notification_type IS NOT NULL AND notification_type='alert' AND expires_at IS NOT NULL)),
  ADD CONSTRAINT outbox_attempts_budget CHECK (attempts<=attempts_max),
  ADD CONSTRAINT outbox_lease_complete CHECK (
    (state='leased' AND locked_by IS NOT NULL AND locked_until IS NOT NULL AND lease_token IS NOT NULL) OR
    (state<>'leased' AND locked_by IS NULL AND locked_until IS NULL AND lease_token IS NULL));
CREATE INDEX outbox_dispatch_idx ON outbox(group_id,available_at,outbox_id) WHERE state IN ('pending','retry','ambiguous','leased');
CREATE TABLE notification_preference (
  group_id text NOT NULL REFERENCES "group"(group_id),
  recipient text NOT NULL REFERENCES identity(identity_id),
  external_enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY(group_id,recipient)
);
CREATE TABLE notification_channel (
  group_id text PRIMARY KEY REFERENCES "group"(group_id),
  suspended boolean NOT NULL DEFAULT true
);
CREATE TABLE internal_notification (
  group_id text NOT NULL,
  event_seq bigint NOT NULL,
  event_ref text NOT NULL CHECK (event_ref ~ '^[0-9a-f]{64}$'),
  recipient text NOT NULL REFERENCES identity(identity_id),
  notification_type text NOT NULL CHECK (notification_type='alert'),
  label text NOT NULL CHECK (label='Une nouvelle notification est disponible dans KÓMBE.'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_ref,recipient,notification_type),
  FOREIGN KEY(group_id,event_seq,event_ref) REFERENCES journal(group_id,seq,hash)
);
CREATE TABLE notification_delivery (
  delivery_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id text NOT NULL REFERENCES "group"(group_id),
  outbox_id bigint NOT NULL,
  FOREIGN KEY(group_id,outbox_id) REFERENCES outbox(group_id,outbox_id),
  attempt integer NOT NULL CHECK (attempt BETWEEN 0 AND 5),
  state text NOT NULL CHECK (state IN ('delivered','retry','ambiguous','suppressed','expired','dead','replayed','deferred')),
  actor text NOT NULL,
  recorded_at timestamptz NOT NULL,
  -- La trace contient seulement des états ; aucun message brut du prestataire.
  code text NOT NULL CHECK (code IN ('OK','CHANNEL_NOT_VERIFIED','PRIVILEGE_NOT_GRANTED','TOKEN_EXPIRED','RESERVATION_INCOHERENTE'))
);
CREATE FUNCTION kombe_c13_trace_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'trace immuable' USING ERRCODE='insufficient_privilege'; END $$;
CREATE TRIGGER notification_delivery_immutable BEFORE UPDATE OR DELETE ON notification_delivery FOR EACH ROW EXECUTE FUNCTION kombe_c13_trace_immutable();
CREATE TRIGGER internal_notification_immutable BEFORE UPDATE OR DELETE ON internal_notification FOR EACH ROW EXECUTE FUNCTION kombe_c13_trace_immutable();
-- Contrat autonome : destinataires actifs relus serveur, types publics seulement.
-- Aucun événement privé (litige) ni payload métier ne quitte le journal.
CREATE FUNCTION kombe_c13_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rec record; cmd text;
BEGIN
  IF NEW.event_type NOT IN ('contribution.declared','contribution.validated','contribution.compensated',
    'disbursement.requested','disbursement.completed','disbursement.reversed',
    'proposal.opened','proposal.closed','proposal.cancelled','proposal.executed') THEN RETURN NEW; END IF;
  cmd := 'c13:' || NEW.group_id || ':' || NEW.seq::text;
  INSERT INTO public.command(command_id,idempotency_key,group_id,status) VALUES(cmd,cmd,NEW.group_id,'applied');
  FOR rec IN SELECT identity_id FROM public.membership WHERE group_id=NEW.group_id AND state='active' LOOP
    INSERT INTO public.internal_notification(group_id,event_seq,event_ref,recipient,notification_type,label)
    VALUES(NEW.group_id,NEW.seq,NEW.hash,rec.identity_id,'alert','Une nouvelle notification est disponible dans KÓMBE.');
    INSERT INTO public.outbox(command_id,topic,payload,group_id,event_seq,event_ref,recipient,channel,notification_type,state,expires_at)
    VALUES(cmd,'notification','{}',NEW.group_id,NEW.seq,NEW.hash,rec.identity_id,'internal','alert','pending',now()+interval '7 days');
    IF EXISTS(SELECT 1 FROM public.notification_preference WHERE group_id=NEW.group_id AND recipient=rec.identity_id AND external_enabled) THEN
      INSERT INTO public.outbox(command_id,topic,payload,group_id,event_seq,event_ref,recipient,channel,notification_type,state,expires_at)
      VALUES(cmd,'notification','{}',NEW.group_id,NEW.seq,NEW.hash,rec.identity_id,'push','alert','pending',now()+interval '1 day');
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION kombe_c13_enqueue() FROM PUBLIC;
CREATE TRIGGER journal_c13_outbox AFTER INSERT ON journal FOR EACH ROW EXECUTE FUNCTION kombe_c13_enqueue();
-- Le worker traite un groupe canonique par transaction, sans BYPASSRLS.
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY c13_worker_tenant ON outbox TO kombe_worker USING(group_id=current_setting('kombe.group_id',true));
CREATE POLICY c13_app_legacy ON outbox TO kombe_app USING(state='legacy');
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['notification_preference','notification_channel','internal_notification','notification_delivery'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY c13_tenant ON %I TO kombe_worker USING (group_id=current_setting(''kombe.group_id'',true))',tab);
  END LOOP;
END $$;
CREATE POLICY c13_internal_self ON internal_notification TO kombe_app USING (
 group_id=current_setting('kombe.group_id',true) AND recipient=current_setting('kombe.identity_id',true)
 AND EXISTS(SELECT 1 FROM identity_access a WHERE a.identity_id=recipient AND a.state='active' AND a.channel_verified
   AND (a.recovery_lock_until IS NULL OR a.recovery_lock_until<=now()))
 AND EXISTS(SELECT 1 FROM membership m WHERE m.group_id=internal_notification.group_id AND m.identity_id=recipient AND m.state='active'));
GRANT USAGE ON SCHEMA public TO kombe_worker;
GRANT SELECT ON membership,notification_preference,notification_channel,internal_notification,notification_delivery TO kombe_worker;
-- Les verrous de droits passent par deux fonctions à sortie minimale : aucun
-- droit UPDATE sur les adhésions ou préférences n'est donné au worker.
CREATE FUNCTION kombe_c13_dispatch_rights(g text, who text)
RETURNS TABLE(active boolean,external_enabled boolean,suspended boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE m text; p boolean; c boolean; account_ok boolean;
BEGIN
  IF g IS DISTINCT FROM current_setting('kombe.group_id',true) THEN RETURN; END IF;
  SELECT true INTO account_ok FROM public.identity_access WHERE identity_id=who AND state='active'
    AND channel_verified AND (recovery_lock_until IS NULL OR recovery_lock_until<=now()) FOR SHARE;
  SELECT membership_id INTO m FROM public.membership WHERE group_id=g AND identity_id=who AND state='active' FOR SHARE;
  SELECT n.external_enabled INTO p FROM public.notification_preference n WHERE group_id=g AND recipient=who FOR SHARE;
  SELECT n.suspended INTO c FROM public.notification_channel n WHERE group_id=g FOR SHARE;
  RETURN QUERY SELECT m IS NOT NULL AND coalesce(account_ok,false),coalesce(p,false),coalesce(c,true);
END $$;
CREATE FUNCTION kombe_c13_replay_rights(g text,who text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE authorized boolean; account_ok boolean;
BEGIN
  IF g IS DISTINCT FROM current_setting('kombe.group_id',true) THEN RETURN false; END IF;
  SELECT true INTO account_ok FROM public.identity_access WHERE identity_id=who AND state='active'
    AND channel_verified AND (recovery_lock_until IS NULL OR recovery_lock_until<=now()) FOR SHARE;
  IF NOT coalesce(account_ok,false) THEN RETURN false; END IF;
  SELECT true INTO authorized FROM public.membership m JOIN public.role_assignment r USING(group_id,membership_id)
  WHERE m.group_id=g AND m.identity_id=who AND m.state='active' AND r.accepted_at IS NOT NULL
  AND r.role IN ('auditor','secretary') LIMIT 1 FOR SHARE OF m,r;
  RETURN coalesce(authorized,false);
END $$;
REVOKE ALL ON FUNCTION kombe_c13_dispatch_rights(text,text),kombe_c13_replay_rights(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_c13_dispatch_rights(text,text),kombe_c13_replay_rights(text,text) TO kombe_worker;
GRANT SELECT,UPDATE ON outbox TO kombe_worker;
GRANT INSERT ON internal_notification,notification_delivery TO kombe_worker;
GRANT USAGE ON SEQUENCE notification_delivery_delivery_id_seq TO kombe_worker;
GRANT SELECT ON internal_notification TO kombe_app;
REVOKE INSERT,UPDATE,DELETE ON internal_notification,notification_delivery FROM kombe_app;
REVOKE ALL ON notification_preference,notification_channel FROM kombe_app;
COMMIT;
