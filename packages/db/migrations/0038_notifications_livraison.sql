-- KÓMBE — Livraison des notifications hors application (P1, ADR-0044).
-- Additif, rétrocompatible ; n'envoie RIEN par lui-même.
--
-- La boîte de réception (inbox_notification, ADR-0042) reste la source :
-- chaque nouvelle notification peut produire, selon les choix de la personne,
-- une ligne de livraison par canal (push, sms, email) dans notification_outbox.
-- Un répartiteur (API, après validation de la transaction, et tâche planifiée)
-- réclame ces lignes par BAIL (FOR UPDATE SKIP LOCKED : deux instances ne
-- prennent jamais la même), appelle le fournisseur, puis consigne l'issue.
--
-- Garde-fous :
--  * CONSENTEMENT : sms/email désactivés par défaut ; push seulement si la
--    personne a enregistré un appareil (l'enregistrement vaut accord) ;
--  * HEURES DE SILENCE (fuseau Africa/Douala, défaut 21:00–07:00) : la ligne
--    est différée à la fin de la plage, jamais perdue ;
--  * types mis en sourdine par la personne : aucune ligne ;
--  * jamais de faux succès : un canal non configuré finit « suppressed »
--    avec son motif ; 5 essais au plus (attente croissante), puis « dead » ;
--  * aucun montant ni nom dans la ligne : le texte est construit à l'envoi,
--    générique hors application (ADR-0016), avec un lien profond.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- Boîte de réception : lecture « mes 100 dernières » et pastille sans tri ni
-- parcours complet quand une personne accumule beaucoup de notifications.
CREATE INDEX IF NOT EXISTS inbox_notification_by_identity_recent
  ON inbox_notification (identity_id, created_at DESC, notification_id DESC);
CREATE INDEX IF NOT EXISTS inbox_notification_unread
  ON inbox_notification (identity_id) WHERE read_at IS NULL;

CREATE TABLE member_notification_preference (
  identity_id   text PRIMARY KEY REFERENCES identity(identity_id),
  push_enabled  boolean NOT NULL DEFAULT true,
  sms_enabled   boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT false,
  quiet_start   time,
  quiet_end     time,
  muted_kinds   text[] NOT NULL DEFAULT '{}',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((quiet_start IS NULL) = (quiet_end IS NULL)),
  CHECK (cardinality(muted_kinds) <= 40)
);
ALTER TABLE member_notification_preference ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_scope ON member_notification_preference
  USING (identity_id = current_setting('kombe.identity_id', true))
  WITH CHECK (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT, INSERT, UPDATE ON member_notification_preference TO kombe_app;
REVOKE DELETE, TRUNCATE ON member_notification_preference FROM kombe_app;

CREATE TABLE push_device (
  device_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_id   text NOT NULL REFERENCES identity(identity_id),
  platform      text NOT NULL CHECK (platform IN ('android','ios','web')),
  token         text NOT NULL CHECK (length(token) BETWEEN 16 AND 4096),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  UNIQUE (token)
);
CREATE INDEX push_device_by_identity ON push_device (identity_id) WHERE revoked_at IS NULL;
ALTER TABLE push_device ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_scope ON push_device
  USING (identity_id = current_setting('kombe.identity_id', true))
  WITH CHECK (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT, INSERT, UPDATE ON push_device TO kombe_app;
REVOKE DELETE, TRUNCATE ON push_device FROM kombe_app;

CREATE TABLE notification_outbox (
  outbox_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id  bigint NOT NULL REFERENCES inbox_notification(notification_id),
  identity_id      text NOT NULL REFERENCES identity(identity_id),
  channel          text NOT NULL CHECK (channel IN ('push','sms','email')),
  state            text NOT NULL DEFAULT 'pending'
                   CHECK (state IN ('pending','sending','sent','retry','suppressed','dead')),
  attempts         integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  not_before       timestamptz NOT NULL DEFAULT now(),
  lease_until      timestamptz,
  last_code        text CHECK (last_code IS NULL OR last_code ~ '^[A-Z_]{2,40}$'),
  provider_ref     text CHECK (provider_ref IS NULL OR length(provider_ref) <= 200),
  created_at       timestamptz NOT NULL DEFAULT now(),
  done_at          timestamptz,
  UNIQUE (notification_id, channel)
);
CREATE INDEX notification_outbox_due ON notification_outbox (not_before) WHERE state IN ('pending','retry','sending');
-- Lecture seule pour l'API (statut de livraison de SES notifications).
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_read ON notification_outbox FOR SELECT
  USING (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT ON notification_outbox TO kombe_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON notification_outbox FROM kombe_app;

/* Fin de la plage de silence si `at` y tombe, sinon `at` (heure Africa/Douala). */
CREATE FUNCTION kombe_quiet_release(at timestamptz, qs time, qe time)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE
  local_ts timestamp := at AT TIME ZONE 'Africa/Douala';
  t time := local_ts::time;
  d date := local_ts::date;
BEGIN
  IF qs IS NULL OR qe IS NULL OR qs = qe THEN RETURN at; END IF;
  IF qs < qe THEN
    IF t >= qs AND t < qe THEN RETURN (d + qe) AT TIME ZONE 'Africa/Douala'; END IF;
  ELSE
    IF t >= qs THEN RETURN (d + 1 + qe) AT TIME ZONE 'Africa/Douala'; END IF;
    IF t < qe THEN RETURN (d + qe) AT TIME ZONE 'Africa/Douala'; END IF;
  END IF;
  RETURN at;
END $$;

/* Une ligne par canal consenti, à la création de chaque notification. */
CREATE FUNCTION kombe_outbox_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  p public.member_notification_preference%ROWTYPE;
  qs time := '21:00'; qe time := '07:00';
  release timestamptz;
BEGIN
  SELECT * INTO p FROM public.member_notification_preference WHERE identity_id = NEW.identity_id;
  IF FOUND THEN
    IF NEW.kind = ANY (p.muted_kinds) THEN RETURN NEW; END IF;
    qs := p.quiet_start; qe := p.quiet_end;
  END IF;
  release := kombe_quiet_release(NEW.created_at, qs, qe);
  IF COALESCE(p.push_enabled, true)
     AND EXISTS (SELECT 1 FROM public.push_device d WHERE d.identity_id = NEW.identity_id AND d.revoked_at IS NULL) THEN
    INSERT INTO public.notification_outbox (notification_id, identity_id, channel, not_before)
    VALUES (NEW.notification_id, NEW.identity_id, 'push', release) ON CONFLICT DO NOTHING;
  END IF;
  IF COALESCE(p.sms_enabled, false) AND NEW.identity_id LIKE '+%' THEN
    INSERT INTO public.notification_outbox (notification_id, identity_id, channel, not_before)
    VALUES (NEW.notification_id, NEW.identity_id, 'sms', release) ON CONFLICT DO NOTHING;
  END IF;
  IF COALESCE(p.email_enabled, false) AND position('@' IN NEW.identity_id) > 1 THEN
    INSERT INTO public.notification_outbox (notification_id, identity_id, channel, not_before)
    VALUES (NEW.notification_id, NEW.identity_id, 'email', release) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inbox_notification_outbox AFTER INSERT ON inbox_notification
  FOR EACH ROW EXECUTE FUNCTION kombe_outbox_enqueue();

/* Réclamation par bail : lignes dues, jamais prises deux fois en parallèle ;
   un bail expiré (instance morte en plein envoi) redevient réclamable. */
CREATE FUNCTION kombe_outbox_claim(batch integer, lease_seconds integer, at_in timestamptz DEFAULT now())
RETURNS TABLE (outbox_id bigint, notification_id bigint, identity_id text, channel text, attempts integer,
               kind text, group_id text, target text, group_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH due AS (
    SELECT o.outbox_id FROM public.notification_outbox o
     WHERE o.not_before <= at_in
       AND (o.state IN ('pending','retry') OR (o.state = 'sending' AND o.lease_until < at_in))
     ORDER BY o.not_before, o.outbox_id
     LIMIT LEAST(GREATEST(batch, 1), 200)
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.notification_outbox o
       SET state = 'sending', lease_until = at_in + make_interval(secs => LEAST(GREATEST(lease_seconds, 5), 600)),
           attempts = LEAST(o.attempts + 1, 5)
      FROM due WHERE o.outbox_id = due.outbox_id
    RETURNING o.outbox_id, o.notification_id, o.identity_id, o.channel, o.attempts
  )
  SELECT upd.outbox_id, upd.notification_id, upd.identity_id, upd.channel, upd.attempts,
         n.kind, n.group_id, n.target, g.display_name
    FROM upd JOIN public.inbox_notification n ON n.notification_id = upd.notification_id
    LEFT JOIN public."group" g ON g.group_id = n.group_id
$$;

/* Issue d'un envoi : sent | retry | suppressed | dead. Une ligne n'est
   consignée que par le détenteur du bail en cours (état « sending »). */
CREATE FUNCTION kombe_outbox_complete(outbox_in bigint, outcome text, code_in text, ref_in text, at_in timestamptz DEFAULT now())
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE o public.notification_outbox%ROWTYPE; final text;
BEGIN
  SELECT * INTO o FROM public.notification_outbox WHERE notification_outbox.outbox_id = outbox_in FOR UPDATE;
  IF NOT FOUND OR o.state <> 'sending' THEN RETURN 'ignored'; END IF;
  final := outcome;
  IF outcome = 'retry' AND o.attempts >= 5 THEN final := 'dead'; END IF;
  IF final NOT IN ('sent','retry','suppressed','dead') THEN RAISE EXCEPTION 'issue inconnue %', outcome; END IF;
  UPDATE public.notification_outbox
     SET state = final, last_code = code_in, provider_ref = ref_in, lease_until = NULL,
         -- attente croissante : 1, 4, 9, 16 minutes
         not_before = CASE WHEN final = 'retry' THEN at_in + make_interval(mins => o.attempts * o.attempts) ELSE not_before END,
         done_at = CASE WHEN final IN ('sent','suppressed','dead') THEN at_in ELSE NULL END
   WHERE notification_outbox.outbox_id = outbox_in;
  RETURN final;
END $$;

/* Jetons push d'une identité (pour l'envoi), et retrait d'un jeton refusé
   définitivement par le fournisseur (appareil désinstallé). */
CREATE FUNCTION kombe_push_tokens(identity_in text)
RETURNS TABLE (device_id bigint, platform text, token text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT d.device_id, d.platform, d.token FROM public.push_device d
   WHERE d.identity_id = identity_in AND d.revoked_at IS NULL ORDER BY d.last_seen_at DESC LIMIT 10
$$;
CREATE FUNCTION kombe_push_token_revoke(device_in bigint, at_in timestamptz DEFAULT now())
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.push_device SET revoked_at = at_in WHERE device_id = device_in AND revoked_at IS NULL
$$;

/* Enregistrement d'un appareil pour la personne connectée. Un jeton est
   unique : un téléphone qui change de mains est rattaché au nouveau compte
   (l'ancien ne reçoit plus rien). */
CREATE FUNCTION kombe_push_register(platform_in text, token_in text, at_in timestamptz DEFAULT now())
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me text := current_setting('kombe.identity_id', true); id bigint;
BEGIN
  IF me IS NULL OR me = '' THEN RAISE EXCEPTION 'session requise' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.push_device (identity_id, platform, token, created_at, last_seen_at)
  VALUES (me, platform_in, token_in, at_in, at_in)
  ON CONFLICT (token) DO UPDATE SET identity_id = me, platform = EXCLUDED.platform, last_seen_at = at_in, revoked_at = NULL
  RETURNING device_id INTO id;
  -- Au plus 10 appareils actifs par personne : les plus anciens sont retirés.
  UPDATE public.push_device SET revoked_at = at_in
   WHERE identity_id = me AND revoked_at IS NULL AND device_id NOT IN (
     SELECT device_id FROM public.push_device WHERE identity_id = me AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 10);
  RETURN id;
END $$;

/* Indicateurs pour la console Opérations (agrégats, aucune donnée personnelle). */
CREATE FUNCTION kombe_outbox_stats()
RETURNS TABLE (channel text, state text, n bigint, oldest timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT o.channel, o.state, count(*), min(o.created_at) FROM public.notification_outbox o
   WHERE kombe_is_operator() GROUP BY 1, 2
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'kombe_outbox_claim(integer, integer, timestamptz)',
    'kombe_outbox_complete(bigint, text, text, text, timestamptz)',
    'kombe_push_tokens(text)',
    'kombe_push_token_revoke(bigint, timestamptz)',
    'kombe_push_register(text, text, timestamptz)',
    'kombe_outbox_stats()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO kombe_app', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION kombe_outbox_enqueue() FROM PUBLIC;

COMMIT;
