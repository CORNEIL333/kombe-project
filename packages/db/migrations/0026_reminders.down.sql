-- Retour arrière de 0026_reminders.sql.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS tontine_cycle;
DROP FUNCTION IF EXISTS kombe_upcoming_meetings(date, integer);
COMMIT;
