-- KÓMBE — Retours des membres (lot « retours-membres »). Additif.
-- 1. Séance en ligne : une séance se tient en présentiel, en ligne ou les deux ;
--    en ligne, le lien de la visioconférence est partagé aux membres.
-- 2. Votes libres : tout membre actif ouvre un vote sur le sujet de son choix,
--    avec des réponses qu'il rédige lui-même (et, s'il le veut, une réponse
--    libre « autre »). Un vote libre n'a AUCUN effet automatique : il éclaire
--    le groupe, il ne décide rien (les décisions qui engagent restent dans
--    group_decision, 0030).
-- 3. Amende payée puis annulée : l'annulation ouvre un remboursement dû au
--    membre ; le remboursement passe par le circuit ordinaire des mouvements
--    (déclaré, confirmé par une autre personne), puis le solde.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── 1. Séance en ligne ─────────────────────────────────────────────────────
ALTER TABLE meeting ADD COLUMN format text NOT NULL DEFAULT 'in_person'
  CHECK (format IN ('in_person','online','hybrid'));
ALTER TABLE meeting ADD COLUMN online_url text
  CHECK (online_url IS NULL OR (length(online_url) <= 500 AND online_url ~ '^https://[^[:space:]]+$'));
ALTER TABLE meeting ADD CONSTRAINT meeting_online_url_only_online
  CHECK (format <> 'in_person' OR online_url IS NULL);

-- ── 2. Votes libres ────────────────────────────────────────────────────────
CREATE TABLE poll (
  poll_id       text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  question      text NOT NULL CHECK (length(btrim(question)) BETWEEN 3 AND 300),
  details       text CHECK (details IS NULL OR length(details) <= 2000),
  -- Réponses rédigées par l'auteur : 0 à 10 (0 = réponses libres seulement).
  options       text[] NOT NULL DEFAULT '{}'
                CHECK (cardinality(options) <= 10
                       AND array_position(options, NULL) IS NULL),
  allow_free_answer boolean NOT NULL DEFAULT false,
  multiple      boolean NOT NULL DEFAULT false,
  anonymous     boolean NOT NULL DEFAULT false,
  created_by_membership_id text NOT NULL,
  created_by_identity_id   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  closes_at     timestamptz,
  state         text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed','cancelled')),
  closed_at     timestamptz,
  closed_by_identity_id text,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, poll_id),
  FOREIGN KEY (group_id, created_by_membership_id) REFERENCES membership(group_id, membership_id),
  CHECK (cardinality(options) >= 2 OR allow_free_answer),
  CHECK (closes_at IS NULL OR closes_at > created_at),
  CHECK (state = 'open' OR closed_at IS NOT NULL)
);
CREATE INDEX poll_group_state ON poll (group_id, state, created_at DESC);

CREATE TABLE poll_ballot (
  group_id      text NOT NULL,
  poll_id       text NOT NULL,
  membership_id text NOT NULL,
  -- Indices (base 0) des réponses choisies dans poll.options.
  choices       smallint[] NOT NULL DEFAULT '{}'
                CHECK (cardinality(choices) <= 10 AND array_position(choices, NULL) IS NULL),
  free_answer   text CHECK (free_answer IS NULL OR length(btrim(free_answer)) BETWEEN 1 AND 300),
  cast_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, membership_id),
  FOREIGN KEY (group_id, poll_id) REFERENCES poll(group_id, poll_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id),
  CHECK (cardinality(choices) > 0 OR free_answer IS NOT NULL)
);

-- Un bulletin se dépose ou se change tant que le vote est ouvert ; jamais effacé.
CREATE FUNCTION poll_ballot_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Bulletin conservé (POLL_STATE_INVALID)' USING ERRCODE = 'check_violation';
  END IF;
  -- L'échéance (closes_at) est appliquée par l'API, sur son horloge.
  SELECT state INTO st FROM poll WHERE poll_id = NEW.poll_id AND group_id = NEW.group_id;
  IF st IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Vote clos (POLL_STATE_INVALID)' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.poll_id <> OLD.poll_id OR NEW.membership_id <> OLD.membership_id OR NEW.group_id <> OLD.group_id) THEN
    RAISE EXCEPTION 'Bulletin : auteur figé (POLL_STATE_INVALID)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER poll_ballot_guard
  BEFORE INSERT OR UPDATE OR DELETE ON poll_ballot
  FOR EACH ROW EXECUTE FUNCTION poll_ballot_guard();

-- Un vote clos ou annulé ne se rouvre pas ; la question et les réponses sont figées.
CREATE FUNCTION poll_state_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.state <> NEW.state AND NOT (OLD.state = 'open' AND NEW.state IN ('closed','cancelled')) THEN
    RAISE EXCEPTION 'Vote : % → % impossible (POLL_STATE_INVALID)', OLD.state, NEW.state USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.question IS DISTINCT FROM OLD.question OR NEW.options IS DISTINCT FROM OLD.options
     OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.multiple IS DISTINCT FROM OLD.multiple
     OR NEW.anonymous IS DISTINCT FROM OLD.anonymous OR NEW.allow_free_answer IS DISTINCT FROM OLD.allow_free_answer
     OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id THEN
    RAISE EXCEPTION 'Vote : objet figé (POLL_STATE_INVALID)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER poll_state_guard
  BEFORE UPDATE ON poll
  FOR EACH ROW EXECUTE FUNCTION poll_state_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['poll','poll_ballot'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (group_id = current_setting(''kombe.group_id'', true))',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO kombe_app', t);
    EXECUTE format('REVOKE DELETE ON %I FROM kombe_app', t);
  END LOOP;
END $$;

ALTER TABLE inbox_notification DROP CONSTRAINT inbox_notification_kind_check;
ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
  CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                  'aid_decided','order_change','membership','minutes_ready','general','decision',
                  'join_request','admitted','rejected','role_proposed','role_reminder',
                  'statutes_published','statutes_reminder','statutes_excluded','statutes_expired',
                  'cycle_started','meeting_opened','draw_committed','fine_cancelled','aid_requested',
                  'vote_reminder','payout_to_confirm','fund_created','movement_rejected','fine_contested',
                  'poll_opened','meeting_updated','fine_refunded'));

-- ── 3. Remboursement d'une amende payée puis annulée ───────────────────────
ALTER TABLE fine ADD COLUMN refund_due boolean NOT NULL DEFAULT false;
ALTER TABLE fine ADD COLUMN refund_movement_id text;
ALTER TABLE fine ADD COLUMN refunded_at timestamptz;
ALTER TABLE fine ADD CONSTRAINT fine_refund_movement_fk
  FOREIGN KEY (group_id, refund_movement_id) REFERENCES fund_movement(group_id, movement_id);
-- Seule une amende annulée APRÈS paiement ouvre un remboursement.
ALTER TABLE fine ADD CONSTRAINT fine_refund_only_cancelled_paid
  CHECK (NOT refund_due OR (state = 'cancelled' AND movement_id IS NOT NULL));
ALTER TABLE fine ADD CONSTRAINT fine_refunded_settles
  CHECK (refunded_at IS NULL OR (refund_movement_id IS NOT NULL AND NOT refund_due));
CREATE INDEX fine_refund_due ON fine (group_id) WHERE refund_due;

COMMIT;
