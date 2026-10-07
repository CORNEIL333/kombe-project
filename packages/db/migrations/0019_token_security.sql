-- KÓMBE Piste A2 — Vérification de jeton RÉELLE par code+hash (décision
-- humaine 2026-10-07). Additive sur 0003_access.sql, sans le modifier.
--
-- CONTEXTE : 0003_access.sql posait déjà `token_hash` (« jamais le code
-- clair ») mais ni le domaine pur (`VerificationToken`) ni le store fictif
-- ne l'exploitaient — le modèle fictif traitait `token_id` comme si c'était
-- le code secret lui-même, jamais haché. Cette migration complète le
-- contrat déjà posé par 0003 : compteur de tentatives (anti brute-force sur
-- un code à 6 chiffres, 10^6 possibilités) et purpose `login` (lien
-- magique, même mécanique que l'inscription/récupération, pas de mot de
-- passe à gérer — D06 jugé non nécessaire pour ce premier déploiement).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- Compteur de tentatives échouées : la décision de verrouillage (nombre
-- maximal) reste SERVEUR (packages/domain/src/access.ts), la base ne fait
-- que rendre le compteur durable et incompressible (append via UPDATE
-- normal ; aucun trigger append-only ici, un jeton reste mutable jusqu'à
-- consommation, contrairement au journal d'événements).
ALTER TABLE verification_token
  ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0);

-- Purpose `login` : lien magique de connexion, même table/mécanique que
-- registration/recovery (code à usage unique, hashé, expirant).
ALTER TABLE verification_token DROP CONSTRAINT verification_token_purpose_check;
ALTER TABLE verification_token
  ADD CONSTRAINT verification_token_purpose_check
  CHECK (purpose IN ('registration','recovery','login'));

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma Piste A2. Sa preuve réelle (incrément
-- atomique du compteur sous verrou, verrouillage après N échecs, purpose
-- login accepté) exige PostgreSQL 16+ réel — voir
-- packages/api/test/pgAccessStore.proof.mjs.
