-- KÓMBE — Décisions votées, reprise de place et parts partagées (ADR-0038).
-- Lots L-03 (pause votée), L-09 (suspension du droit de bouffer), L-10
-- (reprise de place), L-11 (destitution), L-14 (part partagée), exclusion.
-- Additive. RLS `tenant_isolation` sur les deux nouvelles tables ; bulletins
-- append-only ; un seul scrutin ouvert par objet.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── L-10 : historique des titulaires d'une part ────────────────────────────
-- Une part change de titulaire à partir d'un tour (reprise de place) : les
-- tours antérieurs restent dus par l'ancien titulaire.
ALTER TABLE share_holder ADD COLUMN from_seq integer NOT NULL DEFAULT 1 CHECK (from_seq >= 1);
ALTER TABLE share_holder ADD COLUMN until_seq integer;
ALTER TABLE share_holder ADD CONSTRAINT share_holder_range CHECK (until_seq IS NULL OR until_seq >= from_seq - 1);

-- ── L-14 : part partagée (« demi-main ») entre deux membres ───────────────
ALTER TABLE membership ADD COLUMN share_partner_membership_id text;
ALTER TABLE membership ADD CONSTRAINT membership_share_partner_fk
  FOREIGN KEY (group_id, share_partner_membership_id) REFERENCES membership(group_id, membership_id);
ALTER TABLE membership ADD CONSTRAINT membership_share_partner_not_self
  CHECK (share_partner_membership_id IS NULL OR share_partner_membership_id <> membership_id);

-- ── Décisions votées ───────────────────────────────────────────────────────
CREATE TABLE group_decision (
  decision_id   text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  kind          text NOT NULL CHECK (kind IN ('pause','removal','exclusion','payout_suspension','replacement')),
  target_membership_id text,
  target_role   text CHECK (target_role IS NULL OR target_role IN
                  ('animator','vice_president','secretary','treasurer','treasurer_deputy','auditor','censor','advisor')),
  params        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object'),
  reason        text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  opened_by_identity_id text NOT NULL,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  closes_at     timestamptz NOT NULL,
  electorate    integer NOT NULL CHECK (electorate >= 1),
  state         text NOT NULL DEFAULT 'open' CHECK (state IN ('open','adopted','rejected','cancelled','lifted')),
  yes_count     integer CHECK (yes_count IS NULL OR yes_count >= 0),
  no_count      integer CHECK (no_count IS NULL OR no_count >= 0),
  abstain_count integer CHECK (abstain_count IS NULL OR abstain_count >= 0),
  closed_at     timestamptz,
  closed_by_identity_id text,
  outcome_note  text CHECK (outcome_note IS NULL OR length(outcome_note) <= 1000),
  lifted_at     timestamptz,
  lifted_by_identity_id text,
  lift_reason   text CHECK (lift_reason IS NULL OR length(lift_reason) <= 500),
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, decision_id),
  FOREIGN KEY (group_id, target_membership_id) REFERENCES membership(group_id, membership_id),
  CHECK (closes_at > opened_at),
  CHECK (kind = 'pause' OR target_membership_id IS NOT NULL),
  CHECK ((kind = 'removal') = (target_role IS NOT NULL)),
  CHECK (state = 'open' OR closed_at IS NOT NULL),
  CHECK (state NOT IN ('adopted','rejected') OR (yes_count IS NOT NULL AND no_count IS NOT NULL AND abstain_count IS NOT NULL)),
  CHECK (state <> 'lifted' OR (kind = 'payout_suspension' AND lifted_at IS NOT NULL AND lift_reason IS NOT NULL))
);
CREATE UNIQUE INDEX group_decision_one_open
  ON group_decision (group_id, kind, coalesce(target_membership_id, ''), coalesce(target_role, ''))
  WHERE state = 'open';
CREATE INDEX group_decision_group_state ON group_decision (group_id, state);

CREATE TABLE decision_ballot (
  group_id      text NOT NULL,
  decision_id   text NOT NULL,
  membership_id text NOT NULL,
  choice        text NOT NULL CHECK (choice IN ('yes','no','abstain')),
  cast_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_id, membership_id),
  FOREIGN KEY (group_id, decision_id) REFERENCES group_decision(group_id, decision_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id)
);

-- Un bulletin ne se modifie ni ne s'efface, et ne se dépose que pendant le scrutin.
CREATE FUNCTION decision_ballot_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Bulletin définitif (DECISION_STATE_INVALID)' USING ERRCODE = 'check_violation';
  END IF;
  SELECT state INTO st FROM group_decision WHERE decision_id = NEW.decision_id AND group_id = NEW.group_id;
  IF st IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Scrutin clos (DECISION_STATE_INVALID)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER decision_ballot_guard
  BEFORE INSERT OR UPDATE OR DELETE ON decision_ballot
  FOR EACH ROW EXECUTE FUNCTION decision_ballot_guard();

-- Une décision close ne se rouvre pas ; seule une suspension adoptée se lève.
CREATE FUNCTION group_decision_state_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.state <> NEW.state AND NOT (
       (OLD.state = 'open' AND NEW.state IN ('adopted','rejected','cancelled'))
    OR (OLD.state = 'adopted' AND NEW.state = 'lifted' AND OLD.kind = 'payout_suspension')
  ) THEN
    RAISE EXCEPTION 'Décision : % → % impossible (DECISION_STATE_INVALID)', OLD.state, NEW.state USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.target_membership_id IS DISTINCT FROM OLD.target_membership_id
     OR NEW.electorate IS DISTINCT FROM OLD.electorate OR NEW.params IS DISTINCT FROM OLD.params THEN
    RAISE EXCEPTION 'Décision : objet figé (DECISION_STATE_INVALID)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER group_decision_state_guard
  BEFORE UPDATE ON group_decision
  FOR EACH ROW EXECUTE FUNCTION group_decision_state_guard();

-- Notification « décision » (libellé sans nom ni montant).
ALTER TABLE inbox_notification DROP CONSTRAINT inbox_notification_kind_check;
ALTER TABLE inbox_notification ADD CONSTRAINT inbox_notification_kind_check
  CHECK (kind IN ('meeting_reminder','due_reminder','validation_waiting','payout_recorded','fine_issued',
                  'aid_decided','order_change','membership','minutes_ready','general','decision'));

ALTER TABLE group_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_ballot ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON group_decision USING (group_id = current_setting('kombe.group_id', true));
CREATE POLICY tenant_isolation ON decision_ballot USING (group_id = current_setting('kombe.group_id', true));
GRANT SELECT, INSERT, UPDATE ON group_decision TO kombe_app;
GRANT SELECT, INSERT ON decision_ballot TO kombe_app;
REVOKE DELETE ON group_decision FROM kombe_app;
REVOKE UPDATE, DELETE ON decision_ballot FROM kombe_app;

COMMIT;
