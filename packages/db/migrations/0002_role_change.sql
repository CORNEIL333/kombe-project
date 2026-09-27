-- KÓMBE C01 — Migration ADDITIVE : circuit de rôle A19, adhésions gouvernées,
-- demandes d'export privé. Complète le socle 0001_init.sql sans le modifier.
--
-- CONTRAT de persistance (C01). Son APPLICATION et sa PREUVE (RLS effective sur
-- kombe_app non-superuser, verrous, isolation de pool, FK croisées) exigent une
-- PostgreSQL 16+ RÉELLE (lot C01 d'exécution). Sans base, `pnpm --filter @kombe/db
-- migrate` renvoie BLOCKED (2). Aucune donnée réelle.
--
-- Backfill / reprise : migration purement additive (nouvelles tables), donc
-- idempotente vis-à-vis de l'existant. Elle ne réécrit aucune ligne ; un
-- redémarrage après échec relance la transaction (BEGIN/COMMIT) sans effet
-- partiel. Voir 0002_role_change.down.sql pour le retour arrière.

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── Circuit de changement de rôle A19 ────────────────────────────────────────
-- nomination → acceptation du nommé → approbation par un tiers DISTINCT.
CREATE TABLE role_change_request (
  request_id             text PRIMARY KEY,
  group_id               text NOT NULL REFERENCES "group"(group_id),
  target_membership_id   text NOT NULL,
  new_role               text NOT NULL
                         CHECK (new_role IN ('animator','treasurer','secretary','auditor','member')),
  proposed_by_identity_id text NOT NULL REFERENCES identity(identity_id),
  state                  text NOT NULL DEFAULT 'nominated'
                         CHECK (state IN ('nominated','accepted','declined','approved','rejected')),
  accepted_by_identity_id text,   -- doit être l'identité cible (contrôle applicatif)
  approved_by_identity_id text,   -- doit différer du proposant ET du nommé
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, request_id),
  FOREIGN KEY (group_id, target_membership_id)
    REFERENCES membership(group_id, membership_id),
  -- Le proposant ne peut jamais auto-approuver (défense en base, doublure du
  -- contrôle serveur). La distinction avec le Nommé, et le fait que seule
  -- l'identité cible accepte, sont vérifiés au serveur (assertApproverDistinct /
  -- acceptNomination) car l'identité cible transite par membership.
  CHECK (approved_by_identity_id IS NULL
         OR approved_by_identity_id <> proposed_by_identity_id)
);

-- ── Demandes d'export privé (traçabilité ; aucune exposition publique) ────────
CREATE TABLE export_request (
  export_id             text PRIMARY KEY,
  group_id              text NOT NULL REFERENCES "group"(group_id),
  requested_by_identity_id text NOT NULL REFERENCES identity(identity_id),
  scope                 text NOT NULL DEFAULT 'private' CHECK (scope IN ('private')),
  state                 text NOT NULL DEFAULT 'requested'
                        CHECK (state IN ('requested','delivered','revoked')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  delivered_at          timestamptz,
  UNIQUE (group_id, export_id)
);

-- ── RLS additionnelle (mêmes conditions que 0001) ────────────────────────────
ALTER TABLE role_change_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_request ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['role_change_request','export_request'] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (group_id = current_setting(''kombe.group_id'', true))',
      t
    );
  END LOOP;
END $$;

COMMIT;

-- NOTE : ce fichier est un CONTRAT. Voir packages/db/README.md pour la procédure
-- d'application, le provisionnement du rôle applicatif et les tests d'isolation
-- réels (BLOCKED sans PostgreSQL).
