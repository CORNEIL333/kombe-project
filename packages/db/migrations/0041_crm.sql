-- KÓMBE — CRM de la plateforme (ADR-0046). Additif.
--
-- Fusion des consoles Opérations, Direction et Engineering dans un CRM unique.
-- Repères de conformité :
--  * protection des données (RGPD, loi camerounaise n° 2024/017) :
--    - minimisation : le CRM ne connaît une personne que par un identifiant
--      pseudonyme (crm_contact.contact_id), jamais par son numéro ;
--    - finalité : un identifiant de connexion ne s'affiche en clair qu'avec un
--      motif écrit, et la consultation est journalisée ;
--    - droits des personnes : catégorie « données personnelles », échéance
--      légale de 30 jours ;
--    - conservation limitée : anonymisation des demandes closes après 24 mois ;
--  * ISO/IEC 27001 :
--    - accès réservé aux opérateurs (RLS), fonctions séparées (API) ;
--    - journal d'audit en ajout seul ;
--  * ITIL 4 :
--    - priorité = matrice impact × urgence ;
--    - délais de première réponse et de résolution par priorité ;
--  * ISO 10002 :
--    - accusé de réception par référence ;
--    - suivi de l'état ;
--    - satisfaction notée à la clôture.
-- Le CRM ne touche à aucun montant ni à aucune écriture financière.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

/* ── Contacts pseudonymes ──────────────────────────────────────────────── */
CREATE TABLE crm_contact (
  contact_id  text PRIMARY KEY CHECK (contact_id ~ '^ct_[0-9a-f]{20}$'),
  identity_id text NOT NULL UNIQUE REFERENCES identity(identity_id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_contact ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_read ON crm_contact FOR SELECT USING (kombe_is_operator());
CREATE POLICY self_read ON crm_contact FOR SELECT USING (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT ON crm_contact TO kombe_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON crm_contact FROM kombe_app;

/* Identifiant pseudonyme d'une identité, créé au premier besoin (usage interne). */
CREATE FUNCTION kombe_crm_contact_id(identity_in text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE id text;
BEGIN
  IF identity_in IS NULL THEN RETURN NULL; END IF;
  SELECT contact_id INTO id FROM public.crm_contact WHERE identity_id = identity_in;
  IF id IS NOT NULL THEN RETURN id; END IF;
  INSERT INTO public.crm_contact (contact_id, identity_id)
  VALUES ('ct_' || substr(md5(random()::text || clock_timestamp()::text || identity_in), 1, 20), identity_in)
  ON CONFLICT (identity_id) DO NOTHING;
  SELECT contact_id INTO id FROM public.crm_contact WHERE identity_id = identity_in;
  RETURN id;
END $$;
REVOKE ALL ON FUNCTION kombe_crm_contact_id(text) FROM PUBLIC;

/* Identifiant de connexion masqué : jamais affiché en clair par défaut. */
CREATE FUNCTION kombe_crm_mask(login text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN login IS NULL THEN NULL
    WHEN position('@' IN login) > 1 THEN left(login, 1) || '•••' || substr(login, position('@' IN login))
    WHEN length(login) > 6 THEN left(login, 5) || repeat('•', length(login) - 7) || right(login, 2)
    ELSE '•••'
  END
$$;

/* ── Demandes (tickets) ────────────────────────────────────────────────── */
CREATE SEQUENCE crm_ticket_ref_seq;
CREATE TABLE crm_ticket (
  ticket_id            text PRIMARY KEY CHECK (ticket_id ~ '^tk_[0-9a-f]{20}$'),
  ref                  text NOT NULL UNIQUE,
  requester_contact_id text REFERENCES crm_contact(contact_id),
  group_id             text REFERENCES "group"(group_id),
  subject              text NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 140),
  category             text NOT NULL CHECK (category IN ('connexion','cotisation','remise','amende','statuts','application',
                                                         'donnees_personnelles','reclamation','autre')),
  channel              text NOT NULL CHECK (channel IN ('application','telephone','email','whatsapp','sur_place')),
  impact               smallint NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 3),   -- 1 groupe entier ou plus · 2 plusieurs membres · 3 une personne
  urgency              smallint NOT NULL DEFAULT 3 CHECK (urgency BETWEEN 1 AND 3),  -- 1 bloquant · 2 gênant · 3 question
  priority             smallint NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 4), -- posée par déclencheur (matrice ITIL)
  status               text NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','en_cours','attente_membre','resolu','ferme')),
  assignee_contact_id  text REFERENCES crm_contact(contact_id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  first_response_due   timestamptz NOT NULL DEFAULT now(),
  resolution_due       timestamptz NOT NULL DEFAULT now(),
  first_response_at    timestamptz,
  resolved_at          timestamptz,
  closed_at            timestamptz,
  satisfaction         smallint CHECK (satisfaction BETWEEN 1 AND 5),
  satisfaction_comment text CHECK (satisfaction_comment IS NULL OR length(satisfaction_comment) <= 500),
  anonymized_at        timestamptz,
  version              integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_ticket_open ON crm_ticket (status, priority, created_at) WHERE status IN ('nouveau','en_cours','attente_membre');
CREATE INDEX crm_ticket_by_group ON crm_ticket (group_id, created_at DESC);
CREATE INDEX crm_ticket_by_requester ON crm_ticket (requester_contact_id, created_at DESC);
CREATE INDEX crm_ticket_by_assignee ON crm_ticket (assignee_contact_id) WHERE status IN ('nouveau','en_cours','attente_membre');

/* Priorité (matrice impact × urgence) et échéances de service :
   P1 1 h / 8 h · P2 4 h / 24 h · P3 8 h / 72 h · P4 24 h / 7 j ;
   données personnelles : résolution au plus tard à 30 jours (délai légal). */
CREATE FUNCTION kombe_crm_ticket_sla() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE first_h integer; res_h integer;
BEGIN
  NEW.priority := LEAST(4, NEW.impact + NEW.urgency - 1);
  first_h := CASE NEW.priority WHEN 1 THEN 1 WHEN 2 THEN 4 WHEN 3 THEN 8 ELSE 24 END;
  res_h   := CASE NEW.priority WHEN 1 THEN 8 WHEN 2 THEN 24 WHEN 3 THEN 72 ELSE 168 END;
  IF NEW.category = 'donnees_personnelles' THEN res_h := LEAST(res_h, 720); END IF;
  NEW.first_response_due := NEW.created_at + make_interval(hours => first_h);
  NEW.resolution_due     := NEW.created_at + make_interval(hours => res_h);
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    NEW.version := OLD.version + 1;
    IF NEW.status = 'resolu' AND OLD.status <> 'resolu' THEN NEW.resolved_at := now(); END IF;
    IF NEW.status = 'ferme' AND OLD.status <> 'ferme' THEN NEW.closed_at := now(); END IF;
    IF NEW.status IN ('nouveau','en_cours','attente_membre') AND OLD.status IN ('resolu','ferme') THEN
      NEW.resolved_at := NULL; NEW.closed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_ticket_sla BEFORE INSERT OR UPDATE ON crm_ticket FOR EACH ROW EXECUTE FUNCTION kombe_crm_ticket_sla();

CREATE TABLE crm_ticket_message (
  message_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id         text NOT NULL REFERENCES crm_ticket(ticket_id),
  author_kind       text NOT NULL CHECK (author_kind IN ('membre','operateur','systeme')),
  author_contact_id text REFERENCES crm_contact(contact_id),
  visibility        text NOT NULL CHECK (visibility IN ('public','interne')),
  body              text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_ticket_message_by_ticket ON crm_ticket_message (ticket_id, message_id);

/* ── Notes, tâches, journal d'audit ────────────────────────────────────── */
CREATE TABLE crm_note (
  note_id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id          text REFERENCES "group"(group_id),
  contact_id        text REFERENCES crm_contact(contact_id),
  author_contact_id text NOT NULL REFERENCES crm_contact(contact_id),
  body              text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((group_id IS NULL) <> (contact_id IS NULL))
);
CREATE INDEX crm_note_by_group ON crm_note (group_id, created_at DESC) WHERE group_id IS NOT NULL;
CREATE INDEX crm_note_by_contact ON crm_note (contact_id, created_at DESC) WHERE contact_id IS NOT NULL;

CREATE TABLE crm_task (
  task_id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  due_at                timestamptz,
  status                text NOT NULL DEFAULT 'a_faire' CHECK (status IN ('a_faire','fait','annule')),
  assignee_contact_id   text NOT NULL REFERENCES crm_contact(contact_id),
  created_by_contact_id text NOT NULL REFERENCES crm_contact(contact_id),
  group_id              text REFERENCES "group"(group_id),
  contact_id            text REFERENCES crm_contact(contact_id),
  ticket_id             text REFERENCES crm_ticket(ticket_id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  done_at               timestamptz,
  version               integer NOT NULL DEFAULT 1
);
CREATE INDEX crm_task_open ON crm_task (assignee_contact_id, due_at) WHERE status = 'a_faire';

CREATE TABLE crm_audit_log (
  audit_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at               timestamptz NOT NULL DEFAULT now(),
  actor_contact_id text NOT NULL REFERENCES crm_contact(contact_id),
  action           text NOT NULL CHECK (action IN ('consultation_contact','affichage_identifiant','recherche_contact',
                     'consultation_demande','creation_demande','modification_demande','reponse_demande','note_interne',
                     'note','tache','anonymisation','consultation_journal')),
  object_kind      text NOT NULL CHECK (object_kind IN ('contact','demande','groupe','tache','journal')),
  object_id        text,
  motif            text CHECK (motif IS NULL OR length(motif) <= 500),
  detail           jsonb
);
CREATE INDEX crm_audit_by_object ON crm_audit_log (object_kind, object_id, at DESC);
CREATE INDEX crm_audit_by_at ON crm_audit_log (at DESC);

/* ── Accès (RLS) ───────────────────────────────────────────────────────── */
ALTER TABLE crm_ticket ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_all ON crm_ticket USING (kombe_is_operator()) WITH CHECK (kombe_is_operator());
CREATE POLICY requester_read ON crm_ticket FOR SELECT USING (
  requester_contact_id = (SELECT c.contact_id FROM crm_contact c WHERE c.identity_id = current_setting('kombe.identity_id', true)));

ALTER TABLE crm_ticket_message ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_all ON crm_ticket_message USING (kombe_is_operator()) WITH CHECK (kombe_is_operator());
CREATE POLICY requester_read_public ON crm_ticket_message FOR SELECT USING (
  visibility = 'public' AND EXISTS (
    SELECT 1 FROM crm_ticket t JOIN crm_contact c ON c.contact_id = t.requester_contact_id
     WHERE t.ticket_id = crm_ticket_message.ticket_id AND c.identity_id = current_setting('kombe.identity_id', true)));

ALTER TABLE crm_note ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_all ON crm_note USING (kombe_is_operator()) WITH CHECK (kombe_is_operator());
ALTER TABLE crm_task ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_all ON crm_task USING (kombe_is_operator()) WITH CHECK (kombe_is_operator());
ALTER TABLE crm_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_read ON crm_audit_log FOR SELECT USING (kombe_is_operator());
CREATE POLICY operator_insert ON crm_audit_log FOR INSERT WITH CHECK (
  kombe_is_operator() AND actor_contact_id = (SELECT c.contact_id FROM crm_contact c WHERE c.identity_id = current_setting('kombe.identity_id', true)));

GRANT SELECT, INSERT, UPDATE ON crm_ticket, crm_task TO kombe_app;
REVOKE DELETE, TRUNCATE ON crm_ticket, crm_task FROM kombe_app;
GRANT SELECT, INSERT ON crm_ticket_message, crm_note, crm_audit_log TO kombe_app;
REVOKE UPDATE, DELETE, TRUNCATE ON crm_ticket_message, crm_note, crm_audit_log FROM kombe_app;
GRANT USAGE ON SEQUENCE crm_ticket_ref_seq TO kombe_app;

/* ── Fonctions des opérateurs (vérifient elles-mêmes la qualité d'opérateur) ── */
CREATE FUNCTION kombe_crm_assert_operator() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT kombe_is_operator() THEN RAISE EXCEPTION 'réservé aux opérateurs' USING ERRCODE = '42501'; END IF;
  RETURN current_setting('kombe.identity_id', true);
END $$;

/* Contact de l'opérateur courant (auteur des actes du CRM). */
CREATE FUNCTION kombe_crm_me() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT kombe_crm_contact_id(kombe_crm_assert_operator())
$$;

/* Responsables (bureau) d'un groupe : nom, fonctions, identifiant MASQUÉ. */
CREATE FUNCTION kombe_crm_group_contacts(group_in text)
RETURNS TABLE (contact_id text, display_name text, roles text[], membership_state text, login_masked text, login_kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM kombe_crm_assert_operator();
  RETURN QUERY
  SELECT kombe_crm_contact_id(m.identity_id), COALESCE(m.display_name, p.display_name, 'Membre'),
         array_agg(DISTINCT r.role ORDER BY r.role), m.state, kombe_crm_mask(m.identity_id),
         CASE WHEN position('@' IN m.identity_id) > 1 THEN 'email' ELSE 'telephone' END
    FROM public.membership m
    JOIN public.role_assignment r ON r.group_id = m.group_id AND r.membership_id = m.membership_id
                                 AND r.accepted_at IS NOT NULL AND r.ended_at IS NULL AND r.role <> 'member'
    LEFT JOIN public.identity_profile p ON p.identity_id = m.identity_id
   WHERE m.group_id = group_in AND m.state IN ('active','pending') AND m.identity_id NOT LIKE 'offline\_%'
   GROUP BY m.identity_id, m.display_name, p.display_name, m.state;
END $$;

/* Fiche d'un contact : nom, identifiant masqué, groupes et fonctions, préférences de contact. */
CREATE FUNCTION kombe_crm_contact_card(contact_in text)
RETURNS TABLE (contact_id text, display_name text, login_masked text, login_kind text, language text, created_at timestamptz,
               groups jsonb, push_enabled boolean, sms_enabled boolean, email_enabled boolean, is_operator boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ident text;
BEGIN
  PERFORM kombe_crm_assert_operator();
  SELECT c.identity_id INTO ident FROM public.crm_contact c WHERE c.contact_id = contact_in;
  IF ident IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT contact_in, COALESCE(p.display_name, (SELECT m.display_name FROM public.membership m WHERE m.identity_id = ident AND m.display_name IS NOT NULL LIMIT 1), 'Membre'),
         kombe_crm_mask(ident), CASE WHEN position('@' IN ident) > 1 THEN 'email' ELSE 'telephone' END,
         COALESCE(p.language, 'fr'), i.created_at,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('groupId', m.group_id, 'name', g.display_name, 'state', m.state,
                    'roles', COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM public.role_assignment r
                                        WHERE r.group_id = m.group_id AND r.membership_id = m.membership_id
                                          AND r.accepted_at IS NOT NULL AND r.ended_at IS NULL), ARRAY[]::text[]))
                    ORDER BY g.display_name)
                     FROM public.membership m JOIN public."group" g ON g.group_id = m.group_id
                    WHERE m.identity_id = ident), '[]'::jsonb),
         COALESCE(np.push_enabled, true), COALESCE(np.sms_enabled, false), COALESCE(np.email_enabled, false),
         COALESCE(a.is_operator, false)
    FROM public.identity i
    LEFT JOIN public.identity_profile p ON p.identity_id = i.identity_id
    LEFT JOIN public.member_notification_preference np ON np.identity_id = i.identity_id
    LEFT JOIN public.identity_access a ON a.identity_id = i.identity_id
   WHERE i.identity_id = ident;
END $$;

/* Identifiant en clair : motif obligatoire, journalisé dans la même transaction. */
CREATE FUNCTION kombe_crm_reveal(contact_in text, motif_in text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ident text; me text;
BEGIN
  PERFORM kombe_crm_assert_operator();
  IF motif_in IS NULL OR length(btrim(motif_in)) < 10 THEN
    RAISE EXCEPTION 'motif requis (10 caractères au moins)' USING ERRCODE = '22023';
  END IF;
  SELECT c.identity_id INTO ident FROM public.crm_contact c WHERE c.contact_id = contact_in;
  IF ident IS NULL THEN RETURN NULL; END IF;
  me := kombe_crm_me();
  INSERT INTO public.crm_audit_log (actor_contact_id, action, object_kind, object_id, motif)
  VALUES (me, 'affichage_identifiant', 'contact', contact_in, left(btrim(motif_in), 500));
  RETURN ident;
END $$;

/* Recherche d'un contact par identifiant exact (téléphone ou e-mail), journalisée. */
CREATE FUNCTION kombe_crm_find(login_in text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE cid text;
BEGIN
  PERFORM kombe_crm_assert_operator();
  IF NOT EXISTS (SELECT 1 FROM public.identity WHERE identity_id = login_in) THEN RETURN NULL; END IF;
  cid := kombe_crm_contact_id(login_in);
  INSERT INTO public.crm_audit_log (actor_contact_id, action, object_kind, object_id)
  VALUES (kombe_crm_me(), 'recherche_contact', 'contact', cid);
  RETURN cid;
END $$;

/* Noms affichés de contacts (listes de demandes), sans identifiant de connexion. */
CREATE FUNCTION kombe_crm_contact_names(ids text[]) RETURNS TABLE (contact_id text, display_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM kombe_crm_assert_operator();
  RETURN QUERY
  SELECT c.contact_id, COALESCE(p.display_name,
           (SELECT m.display_name FROM public.membership m WHERE m.identity_id = c.identity_id AND m.display_name IS NOT NULL LIMIT 1), 'Membre')
    FROM public.crm_contact c LEFT JOIN public.identity_profile p ON p.identity_id = c.identity_id
   WHERE c.contact_id = ANY (ids);
END $$;

/* Opérateurs (pour l'assignation) : contact, nom, fonctions. */
CREATE FUNCTION kombe_crm_operators() RETURNS TABLE (contact_id text, display_name text, roles text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM kombe_crm_assert_operator();
  RETURN QUERY
  SELECT kombe_crm_contact_id(a.identity_id), COALESCE(p.display_name, 'Opérateur'),
         COALESCE((SELECT array_agg(o.role ORDER BY o.role) FROM public.operator_role o WHERE o.identity_id = a.identity_id), ARRAY[]::text[])
    FROM public.identity_access a LEFT JOIN public.identity_profile p ON p.identity_id = a.identity_id
   WHERE a.is_operator AND a.state = 'active';
END $$;

/* Réponse publique : notification dans l'application du demandeur. */
CREATE FUNCTION kombe_crm_notify_reply(ticket_in text, message_in bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ident text; r text;
BEGIN
  PERFORM kombe_crm_assert_operator();
  SELECT c.identity_id, t.ref INTO ident, r FROM public.crm_ticket t JOIN public.crm_contact c ON c.contact_id = t.requester_contact_id
   WHERE t.ticket_id = ticket_in;
  IF ident IS NULL THEN RETURN; END IF;
  INSERT INTO public.inbox_notification (identity_id, group_id, kind, target, dedup_key, params)
  VALUES (ident, NULL, 'support_reply', '/aide/demandes/' || ticket_in, 'supportReply:' || message_in, jsonb_build_object('ref', r))
  ON CONFLICT (identity_id, dedup_key) DO NOTHING;
END $$;

/* Conservation : demandes closes depuis plus de N jours → anonymisées. */
CREATE FUNCTION kombe_crm_anonymize(older_than_days integer DEFAULT 730) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE n integer;
BEGIN
  PERFORM kombe_crm_assert_operator();
  IF older_than_days < 365 THEN RAISE EXCEPTION 'durée minimale de conservation : 365 jours' USING ERRCODE = '22023'; END IF;
  WITH cible AS (
    SELECT ticket_id FROM public.crm_ticket
     WHERE status = 'ferme' AND anonymized_at IS NULL AND closed_at < now() - make_interval(days => older_than_days)
  ), m AS (
    UPDATE public.crm_ticket_message SET body = '[anonymisé]' WHERE ticket_id IN (SELECT ticket_id FROM cible) RETURNING 1
  )
  UPDATE public.crm_ticket SET subject = '[anonymisé]', satisfaction_comment = NULL, requester_contact_id = NULL, anonymized_at = now()
   WHERE ticket_id IN (SELECT ticket_id FROM cible);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.crm_audit_log (actor_contact_id, action, object_kind, detail)
  VALUES (kombe_crm_me(), 'anonymisation', 'demande', jsonb_build_object('demandes', n, 'plusDe', older_than_days));
  RETURN n;
END $$;

/* Le journal des messages est immuable même pour le propriétaire de l'application ;
   seule l'anonymisation (fonction ci-dessus) le réécrit. */
CREATE FUNCTION kombe_crm_message_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.body = '[anonymisé]' AND NEW.ticket_id = OLD.ticket_id AND NEW.visibility = OLD.visibility THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'message de demande immuable' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER crm_ticket_message_immutable BEFORE UPDATE OR DELETE ON crm_ticket_message FOR EACH ROW EXECUTE FUNCTION kombe_crm_message_immutable();

/* ── Fonctions des membres : ouvrir, répondre, noter ───────────────────── */
CREATE FUNCTION kombe_crm_member_open(subject_in text, category_in text, body_in text, group_in text)
RETURNS TABLE (ticket_id text, ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
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
END $$;

CREATE FUNCTION kombe_crm_member_reply(ticket_in text, body_in text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
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
END $$;

CREATE FUNCTION kombe_crm_member_rate(ticket_in text, score_in integer, comment_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me text := current_setting('kombe.identity_id', true); cid text; n integer;
BEGIN
  cid := (SELECT c.contact_id FROM public.crm_contact c WHERE c.identity_id = me);
  UPDATE public.crm_ticket SET satisfaction = score_in, satisfaction_comment = NULLIF(left(btrim(COALESCE(comment_in, '')), 500), '')
   WHERE ticket_id = ticket_in AND requester_contact_id = cid AND status IN ('resolu','ferme') AND satisfaction IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'demande non résolue ou déjà notée' USING ERRCODE = '23514'; END IF;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'kombe_crm_me()', 'kombe_crm_group_contacts(text)', 'kombe_crm_contact_card(text)', 'kombe_crm_reveal(text, text)',
    'kombe_crm_find(text)', 'kombe_crm_operators()', 'kombe_crm_contact_names(text[])', 'kombe_crm_notify_reply(text, bigint)', 'kombe_crm_anonymize(integer)',
    'kombe_crm_member_open(text, text, text, text)', 'kombe_crm_member_reply(text, text)', 'kombe_crm_member_rate(text, integer, text)',
    'kombe_crm_assert_operator()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO kombe_app', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION kombe_crm_mask(text) TO kombe_app;

/* Notification « le support vous a répondu ». */
ALTER TABLE inbox_notification DROP CONSTRAINT inbox_notification_kind_check;
ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
  CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                  'aid_decided','order_change','membership','minutes_ready','general','decision',
                  'join_request','admitted','rejected','role_proposed','role_reminder',
                  'statutes_published','statutes_reminder','statutes_excluded','statutes_expired',
                  'cycle_started','meeting_opened','draw_committed','fine_cancelled','aid_requested',
                  'vote_reminder','payout_to_confirm','fund_created','movement_rejected','fine_contested',
                  'support_reply'));

/* Registre des traitements : le CRM y figure (finalité, base légale, conservation). */
INSERT INTO processing_record (record_id, purpose, data_categories, legal_basis, recipients, country, retention_days)
VALUES ('crm-support', 'Assistance aux membres et suivi des groupes (demandes, notes internes, tâches)',
        ARRAY['nom affiché','identifiant de connexion (masqué)','contenu des demandes','groupes et fonctions'],
        'legitimate_interest', ARRAY['opérateurs KÓMBE habilités'], 'Union européenne (hébergement Neon, Francfort)', 730)
ON CONFLICT (record_id) DO NOTHING;

COMMIT;
