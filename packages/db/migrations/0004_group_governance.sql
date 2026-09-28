-- KÓMBE C03 — Migration de gouvernance des groupes : élargissement des états
-- du groupe (2.7) et table d'invitations (4.1). L'acceptation des règles (4.2,
-- table `rules_acceptance`) et les rôles (4.4, `role_assignment`) existent déjà
-- dans le socle 0001 et ne sont pas redéfinis.
--
-- CONTRAT de persistance (C03). Son APPLICATION et sa PREUVE (transition
-- d'état gardée, lecture seule en base d'un groupe clos/archivé, invitation
-- bornée/révocable/expirante, unicité d'usage) exigent une PostgreSQL 16+
-- RÉELLE (lot C03 d'exécution). Sans base, `pnpm --filter @kombe/db migrate`
-- renvoie BLOCKED (2). Aucune donnée réelle.
--
-- Reprise : la modification de contrainte est une opération DDL unique dans la
-- transaction BEGIN…COMMIT ; soit elle réussit entièrement, soit elle annule.
-- Retour arrière : 0004_group_governance.down.sql.

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── Élargir les états du groupe (2.7) ────────────────────────────────────────
-- Retire la CHECK automatique existante sur group.state puis la repose avec
-- les deux états additionnels. Le DO block évite de dépendre d'un nom de
-- contrainte implicite fragile.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = '"group"'::regclass
      AND con.contype = 'c'
      AND att.attname = 'state'
  LOOP
    EXECUTE format('ALTER TABLE "group" DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE "group" ADD CONSTRAINT group_state_check CHECK (
  state IN ('configuration','active','paused','closed','stopped_with_discrepancies','archived')
);

-- ── Invitations limitées, expirantes, révocables (4.1) ───────────────────────
-- Une invitation ne révèle PAS le registre réel avant adhésion : elle ne porte
-- aucune donnée métier, seulement un lien borné vers le groupe. Le serveur
-- n'expose qu'une vue publique minimale (nom du groupe).
CREATE TABLE invitation (
  invitation_id text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  channel       text NOT NULL CHECK (channel IN ('link','whatsapp','email')),
  max_uses      integer NOT NULL CHECK (max_uses >= 1),
  used_count    integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  UNIQUE (group_id, invitation_id),
  CHECK (expires_at > issued_at),
  -- Jamais plus d'usages que le maximum autorisé (borne dure en base).
  CHECK (used_count <= max_uses)
);

-- ── RLS : invitation est tenant-scope (elle porte group_id) ──────────────────
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I USING (group_id = current_setting(''kombe.group_id'', true))',
    'invitation'
  );
END $$;

COMMIT;

-- NOTE : la lecture seule d'un groupe `closed`/`archived` et la porte de
-- démarrage du cycle (fonctions indépendantes acceptées + règles acceptées +
-- suppléant) sont des DÉCISIONS serveur (`packages/domain/src/group.ts`) ; la
-- base borne les états et les usages, elle ne « choisit » pas la transition.
-- Preuve effective BLOCKED sans PostgreSQL → voir tests/isolation.pg.mjs.
