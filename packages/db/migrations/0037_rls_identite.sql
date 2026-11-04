-- KÓMBE — Défense en profondeur sur les tables encore sans RLS (audit P0, ADR-0043).
-- Additif et réversible ; aucune donnée modifiée.
--
-- 1. identity : l'identifiant EST l'identifiant de connexion (téléphone ou
--    e-mail). Sans RLS, toute requête du rôle applicatif pouvait énumérer
--    tous les comptes. Désormais : lecture de SA ligne seulement ; création
--    libre (la connexion crée l'identité avant toute session). Les clés
--    étrangères et les fonctions SECURITY DEFINER ne sont pas affectées.
-- 2. kombe_migration : registre des migrations — aucun droit pour le rôle
--    applicatif (la console Engineering le lit via kombe_ops_engineering()).
-- Les tables du socle « vie privée » (personal_consent, data_erasure_tombstone,
-- restore_point, processing_record, legal_notice) et pilot_risk restent sans
-- RLS : leur magasin n'ouvre pas encore de contexte de session ; risque
-- résiduel consigné (docs/production-readiness/02).
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

ALTER TABLE identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_read ON identity FOR SELECT
  USING (identity_id = current_setting('kombe.identity_id', true));
CREATE POLICY create_any ON identity FOR INSERT WITH CHECK (true);
REVOKE UPDATE, DELETE, TRUNCATE ON identity FROM kombe_app;

REVOKE ALL ON kombe_migration FROM kombe_app;
-- Sonde de disponibilité : « tel jalon est-il appliqué ? » (oui/non, rien d'autre).
CREATE FUNCTION kombe_schema_has(name_in text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.kombe_migration WHERE name = name_in)
$$;
REVOKE ALL ON FUNCTION kombe_schema_has(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_schema_has(text) TO kombe_app;

COMMIT;
