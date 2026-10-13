-- KÓMBE — Cycles successifs et redistribution de la réserve de fin d'année (ADR-0039).
-- Additive. Une tontine camerounaise recommence un cycle quand le dernier
-- membre a bouffé ; les tours continuent leur numérotation (le cycle 2 commence
-- au tour N+1) et les parts du nouveau cycle ont leurs propres titulaires.
-- En fin d'année, la réserve est rendue à chacun : chaque remise est une
-- remise ordinaire (déclarée par la trésorerie, accusée par le membre).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── Cycles successifs ──────────────────────────────────────────────────────
CREATE TABLE tontine_cycle (
  group_id      text NOT NULL REFERENCES "group"(group_id),
  cycle_no      integer NOT NULL CHECK (cycle_no >= 1),
  first_seq     integer NOT NULL CHECK (first_seq >= 1),
  last_seq      integer NOT NULL,
  order_kind    text NOT NULL CHECK (order_kind IN ('draw','manual','join_order','legacy')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  started_by_identity_id text,
  PRIMARY KEY (group_id, cycle_no),
  CHECK (last_seq >= first_seq)
);
ALTER TABLE tontine_cycle ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tontine_cycle USING (group_id = current_setting('kombe.group_id', true));
GRANT SELECT, INSERT ON tontine_cycle TO kombe_app;
REVOKE UPDATE, DELETE ON tontine_cycle FROM kombe_app;

-- Les cycles déjà démarrés deviennent le cycle 1.
INSERT INTO tontine_cycle (group_id, cycle_no, first_seq, last_seq, order_kind)
SELECT group_id, 1, min(seq), max(seq), 'legacy' FROM round WHERE share_id IS NOT NULL GROUP BY group_id
ON CONFLICT DO NOTHING;

-- ── Redistribution de la réserve de fin d'année ───────────────────────────
ALTER TABLE fund_movement DROP CONSTRAINT fund_movement_related_kind_check;
ALTER TABLE fund_movement ADD CONSTRAINT fund_movement_related_kind_check
  CHECK (related_kind IS NULL OR related_kind IN ('fine','aid','debt','payout','advance','loan','collector','transfer','reserve'));
-- Une seule remise de réserve par membre et par exercice (related_id = année).
CREATE UNIQUE INDEX fund_movement_one_reserve_share
  ON fund_movement (group_id, related_id, membership_id)
  WHERE related_kind = 'reserve' AND state NOT IN ('rejected','compensated');

COMMIT;
