-- KÓMBE — API produit « tontine réelle » (docs/API_TONTINE.md).
-- Additive. Complète le socle 0024/0025 pour que l'API serve le parcours
-- complet : parts voulues avant démarrage, tour rattaché aux mouvements,
-- graine de tirage scellée, idempotence des commandes par identité.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- Nombre de parts (« mains ») voulues par le membre avant le démarrage ; au
-- démarrage, chaque part devient une ligne `share` (L-14).
ALTER TABLE membership
  ADD COLUMN share_count integer NOT NULL DEFAULT 1 CHECK (share_count BETWEEN 1 AND 5);

-- Tour (= séance) auquel se rattache une cotisation ou une remise.
ALTER TABLE fund_movement
  ADD COLUMN round_seq integer CHECK (round_seq IS NULL OR round_seq >= 1);
CREATE INDEX fund_movement_by_round ON fund_movement (group_id, round_seq);

-- Tirage vérifiable : la graine est tenue par le serveur jusqu'à la
-- révélation (jamais servie par l'API avant), puis recopiée dans `seed`.
ALTER TABLE draw ADD COLUMN sealed_seed text;
ALTER TABLE draw ADD CONSTRAINT draw_sealed_until_reveal
  CHECK (revealed_at IS NULL OR sealed_seed IS NULL);

-- Idempotence des commandes de l'API produit : même clé + même identité ⇒
-- même réponse, aucun double effet. Self-scope (RLS sur l'identité).
CREATE TABLE api_idempotency (
  identity_id     text NOT NULL REFERENCES identity(identity_id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  route           text NOT NULL,
  body_hash       text NOT NULL CHECK (body_hash ~ '^[0-9a-f]{64}$'),
  status_code     integer NOT NULL,
  response        jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, idempotency_key)
);
ALTER TABLE api_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_scope ON api_idempotency
  USING (identity_id = current_setting('kombe.identity_id', true))
  WITH CHECK (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT, INSERT ON api_idempotency TO kombe_app;
REVOKE UPDATE, DELETE ON api_idempotency FROM kombe_app;

COMMIT;
