-- KÓMBE — DÉCOUVERTE DE TRAVAIL POUR LE WORKER OUTBOX (C13).
-- Additive, sans modifier 0013_outbox.sql.
--
-- PROBLÈME : la politique RLS `c13_worker_tenant` (0013) filtre l'outbox pour
-- le rôle kombe_worker sur `group_id = current_setting('kombe.group_id', true)`.
-- L'ordonnanceur du worker (packages/worker/src/main.ts) doit POURTANT découvrir
-- les groupes ayant des notifications à traiter, avant de poser ce contexte par
-- transaction. Une requête directe `SELECT DISTINCT group_id FROM outbox` sous
-- rôle kombe_worker retourne ZÉRO ligne (GUC absent → NULL → aucune ligne),
-- et élargir les privilèges du worker pour compenser violerait le moindre
-- privilège (le worker ne doit lire l'outbox QUE dans le contexte d'un groupe).
--
-- SOLUTION : une fonction SECURITY DEFINER à sortie minimale — uniquement les
-- group_id ayant au moins une ligne outbox non terminale, c'est-à-dire
-- exactement l'ensemble que le worker est chargé de traiter. Aucune ligne
-- métier, aucun destinataire, aucun contenu. Même idiom que
-- kombe_c13_dispatch_rights / kombe_c13_replay_rights (0013) et les
-- résolveurs 0018/0020 : REVOKE à PUBLIC, EXECUTE accordé à kombe_worker
-- seul, search_path figé pour éviter toute injection de schéma.
--
-- STABLE : la fonction ne modifie rien ; la concurrence réelle reste gérée
-- par le lease / SKIP LOCKED côté PgOutboxWorker (reprise multi-instances).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION kombe_c13_pending_groups()
RETURNS TABLE(group_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT o.group_id
  FROM public.outbox AS o
  WHERE o.group_id IS NOT NULL
    AND o.state IN ('pending','retry','ambiguous','leased')
$$;

REVOKE ALL ON FUNCTION kombe_c13_pending_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_c13_pending_groups() TO kombe_worker;

COMMIT;

-- NOTE D'EXÉCUTION : contrat de service worker. La preuve réelle (découverte
-- sous rôle kombe_worker, RLS maintenue sur les lignes) s'exécute sur
-- PostgreSQL 16+ réel — voir packages/db/tests/isolation.pg.mjs et
-- packages/worker/test/postgres.mjs.
