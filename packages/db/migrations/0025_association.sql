-- KÓMBE — Tontine réelle, l'association (lots L-03 à L-10, L-12 à L-15, L-19 à L-21).
-- Additive. Chaque table métier porte group_id, RLS `tenant_isolation`,
-- relations composées (group_id, id). Montants : kombe_money, jamais FLOAT.
-- KÓMBE ne détient aucun argent : chaque « mouvement » documente un mouvement
-- EXTERNE (espèces, Orange Money, MTN MoMo, banque) déclaré puis confirmé.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── L-03 : calendrier réel ─────────────────────────────────────────────────
ALTER TABLE cycle_schedule DROP CONSTRAINT cycle_schedule_frequency_check;
ALTER TABLE cycle_schedule ADD CONSTRAINT cycle_schedule_frequency_check
  CHECK (frequency IN ('monthly','weekly','daily','every_n_days','biweekly','monthly_day','monthly_nth_weekday'));
ALTER TABLE cycle_schedule ADD COLUMN cadence jsonb
  CHECK (cadence IS NULL OR jsonb_typeof(cadence) = 'object');

-- Tour figé après démarrage, SAUF deux changements tracés et autorisés par le
-- serveur dans la transaction : décalage des dates (pause votée, L-03) et
-- changement de titulaire (échange / tour prioritaire approuvés, L-13). La
-- clôture d'un tour (open → closed) reste permise. Jamais de suppression.
CREATE OR REPLACE FUNCTION cycle_round_frozen_guard() RETURNS trigger AS $$
DECLARE
  schedule_state text;
BEGIN
  SELECT state INTO schedule_state FROM cycle_schedule WHERE group_id = OLD.group_id;
  IF schedule_state = 'started' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cycle démarré : tour non supprimable (SCHEDULE_FROZEN)' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.seq IS DISTINCT FROM OLD.seq OR NEW.round_id IS DISTINCT FROM OLD.round_id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.rules_version IS DISTINCT FROM OLD.rules_version THEN
      RAISE EXCEPTION 'Cycle démarré : tour figé (SCHEDULE_FROZEN)' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.beneficiary_membership_id IS DISTINCT FROM OLD.beneficiary_membership_id
        OR NEW.share_id IS DISTINCT FROM OLD.share_id)
       AND coalesce(current_setting('kombe.order_change', true), '') <> 'approved' THEN
      RAISE EXCEPTION 'Cycle démarré : titulaire figé (SCHEDULE_FROZEN)' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.due_date_business IS DISTINCT FROM OLD.due_date_business
        OR NEW.due_at_utc IS DISTINCT FROM OLD.due_at_utc)
       AND coalesce(current_setting('kombe.schedule_shift', true), '') <> 'approved' THEN
      RAISE EXCEPTION 'Cycle démarré : date figée (SCHEDULE_FROZEN)' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

-- ── L-14 : parts (membre ≠ part) ───────────────────────────────────────────
CREATE TABLE share (
  share_id   text PRIMARY KEY,
  group_id   text NOT NULL REFERENCES "group"(group_id),
  label      text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, share_id)
);
CREATE TABLE share_holder (
  group_id      text NOT NULL,
  share_id      text NOT NULL,
  membership_id text NOT NULL,
  weight        integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 100),
  PRIMARY KEY (share_id, membership_id),
  FOREIGN KEY (group_id, share_id) REFERENCES share(group_id, share_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id)
);
ALTER TABLE round ADD COLUMN share_id text;
ALTER TABLE round ADD CONSTRAINT round_share_fk FOREIGN KEY (group_id, share_id) REFERENCES share(group_id, share_id);
-- Le calendrier « une part par membre » garde son index historique (C05) ;
-- un calendrier par parts impose une part par tour.
DROP INDEX IF EXISTS round_one_beneficiary_per_group;
CREATE UNIQUE INDEX round_one_beneficiary_per_group
  ON round (group_id, beneficiary_membership_id)
  WHERE beneficiary_membership_id IS NOT NULL AND share_id IS NULL;
CREATE UNIQUE INDEX round_one_round_per_share
  ON round (group_id, share_id) WHERE share_id IS NOT NULL;

-- ── L-07 : caisses ─────────────────────────────────────────────────────────
CREATE TABLE fund (
  fund_id     text PRIMARY KEY,
  group_id    text NOT NULL REFERENCES "group"(group_id),
  kind        text NOT NULL CHECK (kind IN ('rotation','solidarity','year_end_reserve','operating','fines','loan','collector')),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  rules       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rules) = 'object'),
  state       text NOT NULL DEFAULT 'active' CHECK (state IN ('active','closed')),
  created_by_identity_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  version     integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, fund_id)
);

-- ── L-04 : séances ─────────────────────────────────────────────────────────
CREATE TABLE meeting (
  meeting_id     text PRIMARY KEY,
  group_id       text NOT NULL REFERENCES "group"(group_id),
  seq            integer NOT NULL CHECK (seq >= 1),
  scheduled_date date NOT NULL,
  location       text CHECK (location IS NULL OR length(location) <= 120),
  host_membership_id text,
  round_seq      integer CHECK (round_seq IS NULL OR round_seq >= 1),
  state          text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned','open','closed','cancelled')),
  opened_at      timestamptz,
  opened_by_identity_id text,
  closed_at      timestamptz,
  closed_by_identity_id text,
  notes          text CHECK (notes IS NULL OR length(notes) <= 4000),
  minutes_text   text,
  minutes_hash   text CHECK (minutes_hash IS NULL OR minutes_hash ~ '^[0-9a-f]{64}$'),
  minutes_approved_at timestamptz,
  minutes_approved_in text,
  cancel_reason  text,
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, meeting_id),
  UNIQUE (group_id, seq),
  FOREIGN KEY (group_id, host_membership_id) REFERENCES membership(group_id, membership_id),
  CHECK (state <> 'closed' OR (closed_at IS NOT NULL AND minutes_hash IS NOT NULL)),
  CHECK (state <> 'cancelled' OR (cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) > 0)),
  CHECK (minutes_approved_at IS NULL OR minutes_hash IS NOT NULL)
);

CREATE TABLE attendance (
  group_id      text NOT NULL,
  meeting_id    text NOT NULL,
  membership_id text NOT NULL,
  status        text NOT NULL CHECK (status IN ('present','late','excused','absent','represented')),
  represented_by_membership_id text,
  recorded_by_identity_id text NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, membership_id),
  FOREIGN KEY (group_id, meeting_id) REFERENCES meeting(group_id, meeting_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id),
  FOREIGN KEY (group_id, represented_by_membership_id) REFERENCES membership(group_id, membership_id),
  CHECK ((status = 'represented') = (represented_by_membership_id IS NOT NULL)),
  CHECK (represented_by_membership_id IS NULL OR represented_by_membership_id <> membership_id)
);

-- La présence ne bouge que pendant la séance ouverte.
CREATE FUNCTION attendance_meeting_open_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT state INTO st FROM meeting WHERE meeting_id = COALESCE(NEW.meeting_id, OLD.meeting_id);
  IF st IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Présence hors séance ouverte (MEETING_STATE_INVALID)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_meeting_open
  BEFORE INSERT OR UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION attendance_meeting_open_guard();

-- ── L-07 / L-16 : mouvements de caisse (registre de mouvements EXTERNES) ──
CREATE TABLE fund_movement (
  movement_id   text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  fund_id       text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('contribution','payout','fine_payment','advance','advance_repayment',
                                              'transfer_in','transfer_out','fee','expense')),
  amount        kombe_money NOT NULL CHECK (amount > 0),
  membership_id text,
  meeting_id    text,
  state         text NOT NULL DEFAULT 'declared'
                CHECK (state IN ('declared','confirmed','validated','rejected','compensated')),
  channel       text NOT NULL CHECK (channel IN ('cash','orange_money','mtn_momo','bank','other')),
  reference     text CHECK (reference IS NULL OR length(reference) <= 64),
  justification text CHECK (justification IS NULL OR length(justification) <= 500),
  payer_note    text CHECK (payer_note IS NULL OR length(payer_note) <= 120),
  alleged_date  date,
  declared_by_identity_id text NOT NULL,
  declared_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_by_identity_id text,
  confirmed_at  timestamptz,
  controlled_by_identity_id text,
  controlled_at timestamptz,
  rejected_reason text,
  compensates_movement_id text,
  related_kind  text CHECK (related_kind IS NULL OR related_kind IN ('fine','aid','debt','payout','advance','loan','collector','transfer')),
  related_id    text,
  witness_membership_ids text[] NOT NULL DEFAULT '{}',
  beneficiary_confirmed_at timestamptz,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, movement_id),
  FOREIGN KEY (group_id, fund_id) REFERENCES fund(group_id, fund_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id),
  FOREIGN KEY (group_id, meeting_id) REFERENCES meeting(group_id, meeting_id),
  FOREIGN KEY (group_id, compensates_movement_id) REFERENCES fund_movement(group_id, movement_id),
  -- Indépendance structurelle (ADR-0018 étendue) : trois personnes distinctes.
  CHECK (confirmed_by_identity_id IS NULL OR confirmed_by_identity_id <> declared_by_identity_id),
  CHECK (controlled_by_identity_id IS NULL OR
         (controlled_by_identity_id <> declared_by_identity_id
          AND controlled_by_identity_id IS DISTINCT FROM confirmed_by_identity_id)),
  -- Électronique sans référence ⇒ motif (C06 étendu aux canaux Mobile Money).
  CHECK (channel = 'cash' OR reference IS NOT NULL OR (justification IS NOT NULL AND length(btrim(justification)) > 0)),
  CHECK (state <> 'rejected' OR (rejected_reason IS NOT NULL AND length(btrim(rejected_reason)) > 0))
);
CREATE UNIQUE INDEX fund_movement_one_reversal
  ON fund_movement (compensates_movement_id) WHERE compensates_movement_id IS NOT NULL;
CREATE INDEX fund_movement_by_fund ON fund_movement (group_id, fund_id);

-- ── L-09 : amendes ─────────────────────────────────────────────────────────
CREATE TABLE fine (
  fine_id       text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  membership_id text NOT NULL,
  meeting_id    text,
  kind          text NOT NULL CHECK (kind IN ('late_contribution','meeting_late','meeting_absence','indiscipline')),
  amount        kombe_money NOT NULL CHECK (amount > 0),
  reason        text NOT NULL CHECK (length(btrim(reason)) >= 3),
  issued_by_identity_id text NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  state         text NOT NULL DEFAULT 'issued' CHECK (state IN ('issued','contested','paid','cancelled')),
  dispute_id    text,
  movement_id   text,
  cancel_reason text,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, fine_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id),
  FOREIGN KEY (group_id, meeting_id) REFERENCES meeting(group_id, meeting_id),
  FOREIGN KEY (group_id, movement_id) REFERENCES fund_movement(group_id, movement_id),
  CHECK (state <> 'paid' OR movement_id IS NOT NULL),
  CHECK (state <> 'cancelled' OR (cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) > 0))
);

-- ── L-08 : secours ─────────────────────────────────────────────────────────
CREATE TABLE aid_request (
  aid_id        text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  fund_id       text NOT NULL,
  beneficiary_membership_id text NOT NULL,
  event         text NOT NULL CHECK (event IN ('death_member','death_spouse','death_parent','death_child',
                                               'birth','marriage','illness','other')),
  event_date    date NOT NULL,
  amount        kombe_money NOT NULL CHECK (amount > 0),
  override_reason text,
  note          text CHECK (note IS NULL OR length(note) <= 500),
  state         text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','approved','rejected','paid','cancelled')),
  requested_by_identity_id text NOT NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_by_identity_id text,
  decided_at    timestamptz,
  decision_note text,
  movement_id   text,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, aid_id),
  FOREIGN KEY (group_id, fund_id) REFERENCES fund(group_id, fund_id),
  FOREIGN KEY (group_id, beneficiary_membership_id) REFERENCES membership(group_id, membership_id),
  FOREIGN KEY (group_id, movement_id) REFERENCES fund_movement(group_id, movement_id),
  CHECK (state NOT IN ('approved','rejected','paid') OR decided_by_identity_id IS NOT NULL),
  CHECK (state <> 'paid' OR movement_id IS NOT NULL)
);

-- ── L-10 : dettes ──────────────────────────────────────────────────────────
CREATE TABLE member_debt (
  debt_id       text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  debtor_membership_id text NOT NULL,
  origin        text NOT NULL CHECK (origin IN ('unpaid_obligation','fund_advance','unpaid_fine','catch_up')),
  origin_ref    text,
  amount        kombe_money NOT NULL CHECK (amount > 0),
  settled       kombe_money NOT NULL DEFAULT 0,
  state         text NOT NULL DEFAULT 'open' CHECK (state IN ('open','settled','written_off')),
  creditor_fund_id text,
  guarantor_membership_id text,
  created_by_identity_id text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  write_off_reason text,
  decided_by_identity_id text,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, debt_id),
  FOREIGN KEY (group_id, debtor_membership_id) REFERENCES membership(group_id, membership_id),
  FOREIGN KEY (group_id, guarantor_membership_id) REFERENCES membership(group_id, membership_id),
  FOREIGN KEY (group_id, creditor_fund_id) REFERENCES fund(group_id, fund_id),
  CHECK (settled <= amount),
  CHECK (guarantor_membership_id IS NULL OR guarantor_membership_id <> debtor_membership_id),
  CHECK (state <> 'settled' OR settled = amount),
  CHECK (state <> 'written_off' OR (write_off_reason IS NOT NULL AND decided_by_identity_id IS NOT NULL))
);

-- ── L-13 : changements d'ordre et tirage ───────────────────────────────────
CREATE TABLE order_change (
  change_id     text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  kind          text NOT NULL CHECK (kind IN ('swap','priority')),
  seq_a         integer NOT NULL CHECK (seq_a >= 1),
  seq_b         integer NOT NULL CHECK (seq_b >= 1),
  reason        text CHECK (reason IS NULL OR length(reason) <= 500),
  required_identity_ids text[] NOT NULL,
  accepted_identity_ids text[] NOT NULL DEFAULT '{}',
  requested_by_identity_id text NOT NULL,
  approved_by_identity_id text,
  state         text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','applied','rejected','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  applied_at    timestamptz,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, change_id),
  CHECK (seq_a <> seq_b),
  CHECK (approved_by_identity_id IS NULL OR NOT (approved_by_identity_id = ANY (required_identity_ids)))
);

CREATE TABLE draw (
  draw_id       text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  commitment    text NOT NULL CHECK (commitment ~ '^[0-9a-f]{64}$'),
  seed          text,
  committed_by_identity_id text NOT NULL,
  committed_at  timestamptz NOT NULL DEFAULT now(),
  revealed_at   timestamptz,
  result        text[],
  UNIQUE (group_id, draw_id),
  CHECK ((seed IS NULL) = (revealed_at IS NULL)),
  CHECK ((result IS NULL) = (revealed_at IS NULL))
);

-- Enchères (drapeau fermé « auction », ADR-0032).
CREATE TABLE auction_bid (
  bid_id        text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  round_seq     integer NOT NULL CHECK (round_seq >= 1),
  membership_id text NOT NULL,
  premium       kombe_money NOT NULL,
  placed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, bid_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id)
);

-- ── L-12 : statuts et règlement intérieur ──────────────────────────────────
CREATE TABLE statutes_version (
  group_id      text NOT NULL REFERENCES "group"(group_id),
  version       integer NOT NULL CHECK (version >= 1),
  title         text NOT NULL,
  body          text NOT NULL,
  hash          text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  rules_version integer,
  published_by_identity_id text NOT NULL,
  published_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, version)
);
CREATE TABLE statutes_acceptance (
  group_id      text NOT NULL,
  version       integer NOT NULL,
  identity_id   text NOT NULL REFERENCES identity(identity_id),
  hash          text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, version, identity_id),
  FOREIGN KEY (group_id, version) REFERENCES statutes_version(group_id, version)
);
CREATE FUNCTION statutes_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Statuts publiés immuables : publier une nouvelle version' USING ERRCODE = 'insufficient_privilege'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER statutes_version_immutable BEFORE UPDATE OR DELETE ON statutes_version
  FOR EACH ROW EXECUTE FUNCTION statutes_immutable();

-- ── L-19 : registre de prêts (drapeau fermé « loan_register ») ─────────────
CREATE TABLE loan (
  loan_id       text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  fund_id       text NOT NULL,
  borrower_membership_id text NOT NULL,
  principal     kombe_money NOT NULL CHECK (principal > 0),
  participation_fee kombe_money NOT NULL DEFAULT 0,
  installments  integer NOT NULL CHECK (installments BETWEEN 1 AND 24),
  guarantor_membership_id text,
  state         text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','approved','rejected','disbursed','repaid','defaulted')),
  requested_by_identity_id text NOT NULL,
  decided_by_identity_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, loan_id),
  FOREIGN KEY (group_id, fund_id) REFERENCES fund(group_id, fund_id),
  FOREIGN KEY (group_id, borrower_membership_id) REFERENCES membership(group_id, membership_id),
  FOREIGN KEY (group_id, guarantor_membership_id) REFERENCES membership(group_id, membership_id),
  CHECK (guarantor_membership_id IS NULL OR guarantor_membership_id <> borrower_membership_id),
  CHECK (decided_by_identity_id IS NULL OR decided_by_identity_id <> requested_by_identity_id)
);

-- ── L-21 : collecte journalière (drapeau fermé « daily_collector ») ────────
CREATE TABLE collector_period (
  period_id     text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  fund_id       text NOT NULL,
  collector_name text NOT NULL CHECK (length(btrim(collector_name)) BETWEEN 1 AND 80),
  membership_id text NOT NULL,
  daily_amount  kombe_money NOT NULL CHECK (daily_amount > 0),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  days_collected integer NOT NULL DEFAULT 0 CHECK (days_collected BETWEEN 0 AND 31),
  commission_days integer NOT NULL DEFAULT 1 CHECK (commission_days >= 0),
  state         text NOT NULL DEFAULT 'open' CHECK (state IN ('open','returned')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, period_id),
  FOREIGN KEY (group_id, fund_id) REFERENCES fund(group_id, fund_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id),
  CHECK (period_end >= period_start),
  CHECK (commission_days <= days_collected OR state = 'open')
);

-- ── L-20 : historique importé de l'ancienne application ───────────────────
CREATE TABLE legacy_import (
  import_id     text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  legacy_group_id text NOT NULL,
  report        jsonb NOT NULL,
  imported_by_identity_id text NOT NULL,
  imported_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, import_id)
);
CREATE TABLE legacy_contribution (
  group_id      text NOT NULL REFERENCES "group"(group_id),
  legacy_id     text NOT NULL,
  import_id     text NOT NULL,
  legacy_member_name text NOT NULL,
  membership_id text,
  amount        kombe_money NOT NULL CHECK (amount > 0),
  contribution_date date NOT NULL,
  -- Sentinelle : un historique importé n'entre dans AUCUN total courant.
  imported_historical boolean NOT NULL DEFAULT true CHECK (imported_historical),
  PRIMARY KEY (group_id, legacy_id),
  FOREIGN KEY (group_id, import_id) REFERENCES legacy_import(group_id, import_id)
);

-- ── L-15 : boîte de notifications de l'application (self-scope) ───────────
-- Libellés courts SANS montant ni nom (écran verrouillé, ADR-0016) ; le
-- détail se lit dans le groupe après authentification.
CREATE TABLE inbox_notification (
  notification_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_id   text NOT NULL REFERENCES identity(identity_id),
  group_id      text REFERENCES "group"(group_id),
  kind          text NOT NULL CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded',
                                              'fine_issued','aid_decided','order_change','membership','minutes_ready','general')),
  target        text CHECK (target IS NULL OR length(target) <= 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz,
  dedup_key     text NOT NULL,
  UNIQUE (identity_id, dedup_key)
);
ALTER TABLE inbox_notification ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_scope ON inbox_notification
  USING (identity_id = current_setting('kombe.identity_id', true));
-- L'écriture se fait depuis le contexte d'un groupe (pas de l'identité
-- destinataire) : fonction SECURITY DEFINER à entrée bornée.
CREATE FUNCTION kombe_notify(identity_in text, group_in text, kind_in text, target_in text, dedup_in text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.inbox_notification (identity_id, group_id, kind, target, dedup_key)
  SELECT identity_in, group_in, kind_in, target_in, dedup_in
  WHERE group_in = current_setting('kombe.group_id', true)
    AND EXISTS (SELECT 1 FROM public.membership m
                 WHERE m.group_id = group_in AND m.identity_id = identity_in AND m.state IN ('active','pending'))
  ON CONFLICT (identity_id, dedup_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION kombe_notify(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_notify(text, text, text, text, text) TO kombe_app;

-- ── RLS tenant_isolation sur toutes les tables de groupe ───────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'share','share_holder','fund','meeting','attendance','fund_movement','fine','aid_request',
    'member_debt','order_change','draw','auction_bid','statutes_version','statutes_acceptance',
    'loan','collector_period','legacy_import','legacy_contribution'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (group_id = current_setting(''kombe.group_id'', true))',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO kombe_app', t);
    EXECUTE format('REVOKE DELETE ON %I FROM kombe_app', t);
  END LOOP;
END $$;
-- Parts : recomposables tant que le calendrier est en brouillon (un tour qui
-- référence la part bloque la suppression par FK ; après démarrage, le gel
-- des tours empêche de détacher une part).
GRANT DELETE ON share, share_holder TO kombe_app;
GRANT SELECT, UPDATE ON inbox_notification TO kombe_app;
REVOKE INSERT, DELETE ON inbox_notification FROM kombe_app;

COMMIT;
