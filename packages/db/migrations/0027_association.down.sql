-- Retour arrière de 0025_association.sql (ordre inverse).
-- Prérequis : aucun calendrier n'utilise une fréquence élargie et aucun tour
-- n'est rattaché à une part (sinon les CHECK/index réduits échouent).
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS kombe_notify(text, text, text, text, text);
DROP TABLE IF EXISTS inbox_notification;

DROP TABLE IF EXISTS legacy_contribution;
DROP TABLE IF EXISTS legacy_import;
DROP TABLE IF EXISTS collector_period;
DROP TABLE IF EXISTS loan;
DROP TRIGGER IF EXISTS statutes_version_immutable ON statutes_version;
DROP TABLE IF EXISTS statutes_acceptance;
DROP TABLE IF EXISTS statutes_version;
DROP FUNCTION IF EXISTS statutes_immutable();
DROP TABLE IF EXISTS auction_bid;
DROP TABLE IF EXISTS draw;
DROP TABLE IF EXISTS order_change;
DROP TABLE IF EXISTS member_debt;
DROP TABLE IF EXISTS aid_request;
DROP TABLE IF EXISTS fine;
DROP TABLE IF EXISTS fund_movement;
DROP TRIGGER IF EXISTS attendance_meeting_open ON attendance;
DROP TABLE IF EXISTS attendance;
DROP FUNCTION IF EXISTS attendance_meeting_open_guard();
DROP TABLE IF EXISTS meeting;
DROP TABLE IF EXISTS fund;

DROP INDEX IF EXISTS round_one_round_per_share;
DROP INDEX IF EXISTS round_one_beneficiary_per_group;
-- Base vierge (premier run des recettes) : round peut ne pas exister encore.
DO $$ BEGIN
  IF to_regclass('round') IS NOT NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX round_one_beneficiary_per_group
      ON round (group_id, beneficiary_membership_id)
      WHERE beneficiary_membership_id IS NOT NULL';
    EXECUTE 'ALTER TABLE round DROP CONSTRAINT IF EXISTS round_share_fk, DROP COLUMN IF EXISTS share_id';
  END IF;
END $$;
DROP TABLE IF EXISTS share_holder;
DROP TABLE IF EXISTS share;

CREATE OR REPLACE FUNCTION cycle_round_frozen_guard() RETURNS trigger AS $$
DECLARE
  schedule_state text;
BEGIN
  SELECT state INTO schedule_state FROM cycle_schedule WHERE group_id = OLD.group_id;
  IF schedule_state = 'started' THEN
    RAISE EXCEPTION 'Cycle démarré : tour figé (SCHEDULE_FROZEN)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS cycle_schedule DROP COLUMN IF EXISTS cadence;
ALTER TABLE IF EXISTS cycle_schedule DROP CONSTRAINT IF EXISTS cycle_schedule_frequency_check;
ALTER TABLE IF EXISTS cycle_schedule ADD CONSTRAINT cycle_schedule_frequency_check
  CHECK (frequency IN ('monthly','weekly'));

COMMIT;
