-- KÓMBE — DÉMONTAGE de la migration 0022_cycle_schedule.sql (ordre inverse).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS cycle_schedule;
DROP TRIGGER IF EXISTS round_frozen ON round;
DROP TRIGGER IF EXISTS obligation_frozen ON obligation;
DROP FUNCTION IF EXISTS cycle_obligation_frozen_guard();
DROP FUNCTION IF EXISTS cycle_round_frozen_guard();
DROP FUNCTION IF EXISTS cycle_schedule_frozen_guard();

COMMIT;
