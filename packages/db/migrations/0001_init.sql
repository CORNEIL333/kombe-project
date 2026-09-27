-- KÓMBE C00/C01 — Schéma canonique du registre de tontines fermées.
-- CONTRAT de persistance posé par C00 ; la mise à l'épreuve réelle (RLS,
-- verrous, FK composites, isolation de pool) est le lot C01 et exige une
-- PostgreSQL 16+ RÉELLE. Sur un hôte sans base, l'exécution est BLOCKED :
-- voir packages/db/README.md. Aucune donnée réelle ; only fictitious below.
--
-- Invariants (ARCHITECTURE_CIBLE §Invariants) :
--   * Montant = BIGINT entier, borné [0, 1_000_000_000] par montant unitaire,
--     et globalement <= 9007199254740991 (entier sûr JSON). Jamais de FLOAT.
--   * Chaque objet métier porte group_id ; les relations composées sont
--     UNIQUE/FK sur (group_id, id) pour rendre l'isolation multi-tenant
--     structurelle, pas seulement applicative.
--   * RLS activée sur toute table tenant-scope ; le rôle applicatif
--     kombe_app n'est PAS superuser et n'a PAS BYPASSRLS.

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── Types auxiliaires ──────────────────────────────────────────────────────
-- XAF entier. Le CHECK plancher plafonne le montant unitaire ; le plafond
-- total (entier sûr) est vérifié en domaine. À figer par ADR07.
CREATE DOMAIN kombe_money AS bigint
  CHECK (VALUE >= 0 AND VALUE <= 1000000000);

-- ── Identité et adhésions ────────────────────────────────────────────────────
CREATE TABLE identity (
  identity_id  text PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "group" (
  group_id   text PRIMARY KEY,
  state      text NOT NULL DEFAULT 'configuration'
             CHECK (state IN ('configuration','active','paused','closed')),
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE membership (
  membership_id text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  identity_id   text NOT NULL REFERENCES identity(identity_id),
  state         text NOT NULL CHECK (state IN ('pending','active','departed','revoked')),
  active_marker text GENERATED ALWAYS AS
    (CASE WHEN state = 'active' THEN group_id || '@' || identity_id ELSE NULL END) STORED,
  UNIQUE (group_id, membership_id),
  -- Une seule adhésion ACTIVE par (groupe, identité) — unicité structurelle.
  UNIQUE (active_marker)
);

CREATE TABLE role_assignment (
  role_assignment_id text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  membership_id text NOT NULL,
  role          text NOT NULL CHECK (role IN ('animator','treasurer','secretary','auditor','member')),
  accepted_at   timestamptz,  -- le nommé doit accepter avant affectation active
  UNIQUE (group_id, role_assignment_id),
  FOREIGN KEY (group_id, membership_id) REFERENCES membership(group_id, membership_id)
);

-- ── Règles (snapshot immuable) et acceptations ──────────────────────────────
CREATE TABLE rule_version (
  group_id      text NOT NULL REFERENCES "group"(group_id),
  rules_version integer NOT NULL CHECK (rules_version >= 1),
  snapshot      jsonb NOT NULL,          -- canonique, immuable une fois insérée
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, rules_version)
);

CREATE TABLE rules_acceptance (
  group_id      text NOT NULL,
  identity_id   text NOT NULL REFERENCES identity(identity_id),
  rules_version integer NOT NULL,
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, identity_id, rules_version),
  FOREIGN KEY (group_id, rules_version) REFERENCES rule_version(group_id, rules_version)
);

-- ── Tours, obligations, contributions, validations ─────────────────────────
CREATE TABLE round (
  round_id   text PRIMARY KEY,
  group_id   text NOT NULL REFERENCES "group"(group_id),
  seq        integer NOT NULL CHECK (seq >= 1),
  state      text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  UNIQUE (group_id, round_id),
  UNIQUE (group_id, seq)
);

CREATE TABLE obligation (
  obligation_id text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES "group"(group_id),
  round_id      text NOT NULL,
  member_membership_id text NOT NULL,
  due_amount    kombe_money NOT NULL,
  validated_net kombe_money NOT NULL DEFAULT 0,
  active_reserved kombe_money NOT NULL DEFAULT 0,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, obligation_id),
  FOREIGN KEY (group_id, round_id) REFERENCES round(group_id, round_id),
  FOREIGN KEY (group_id, member_membership_id) REFERENCES membership(group_id, membership_id),
  -- Cohérence « sous verrou » : validé <= réservation <= dû.
  CHECK (validated_net <= active_reserved AND active_reserved <= due_amount)
);

CREATE TABLE contribution (
  contribution_id text PRIMARY KEY,
  group_id        text NOT NULL REFERENCES "group"(group_id),
  obligation_id   text NOT NULL,
  declared_amount kombe_money NOT NULL,
  state           text NOT NULL CHECK (state IN ('declared','validated','rejected','compensated')),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  declared_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, contribution_id),
  FOREIGN KEY (group_id, obligation_id) REFERENCES obligation(group_id, obligation_id)
);

-- Une seule validation par (contribution, rôle) — compensation/remplacement
-- tracés, jamais une seconde validation silencieuse.
CREATE TABLE validation (
  contribution_id text NOT NULL,
  role            text NOT NULL CHECK (role IN ('animator','treasurer','secretary','auditor')),
  validator_membership_id text NOT NULL,
  validated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contribution_id, role)
);

CREATE TABLE disbursement (
  disbursement_id text PRIMARY KEY,
  group_id        text NOT NULL REFERENCES "group"(group_id),
  round_id        text NOT NULL,
  amount          kombe_money NOT NULL,
  state           text NOT NULL CHECK (state IN ('requested','reversal_requested','reversed','completed')),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, disbursement_id),
  FOREIGN KEY (group_id, round_id) REFERENCES round(group_id, round_id)
);

-- ── Votes et bulletins (électeurs figés à l'ouverture) ──────────────────────
CREATE TABLE vote (
  vote_id      text PRIMARY KEY,
  group_id     text NOT NULL REFERENCES "group"(group_id),
  electorate_size integer NOT NULL CHECK (electorate_size >= 1),
  quorum_num   integer NOT NULL CHECK (quorum_num >= 0),
  quorum_den   integer NOT NULL CHECK (quorum_den >= 1),
  state        text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed','cancelled')),
  frozen_electors bigint[] NOT NULL,   -- snapshot des votants à l'ouverture
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (group_id, vote_id),
  CHECK (quorum_num <= quorum_den)
);

CREATE TABLE ballot (
  vote_id      text NOT NULL REFERENCES vote(vote_id),
  identity_id  text NOT NULL REFERENCES identity(identity_id),
  choice       text NOT NULL CHECK (choice IN ('yes','no','abstain')),
  cast_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vote_id, identity_id)   -- un bulletin par électeur
);

-- ── Litiges ──────────────────────────────────────────────────────────────────
CREATE TABLE dispute (
  dispute_id  text PRIMARY KEY,
  group_id    text NOT NULL REFERENCES "group"(group_id),
  state       text NOT NULL CHECK (state IN ('open','resolved','reopened')),
  opened_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, dispute_id)
);

-- ── Journal append-only (chaîne de hash RFC 8785, genèse = 64 zéros) ────────
CREATE TABLE journal (
  group_id       text NOT NULL REFERENCES "group"(group_id),
  seq            bigint NOT NULL CHECK (seq >= 1),
  event_type     text NOT NULL,
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  previous_hash  text NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  hash           text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  payload        jsonb NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, seq)
);

-- ── Registre de commandes (idempotence) et outbox transactionnelle ─────────
CREATE TABLE command (
  command_id      text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  group_id        text REFERENCES "group"(group_id),
  status          text NOT NULL CHECK (status IN ('queued','applied','rejected','conflict')),
  result_version  integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
  outbox_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  command_id  text NOT NULL REFERENCES command(command_id),
  topic       text NOT NULL,
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- ── RLS : défense additionnelle côté serveur (testée réellement en C01) ──────
-- Le contexte est posé par transaction : SET LOCAL kombe.group_id = '...'.
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE round ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursement ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;

-- Politique type : un rôle applicatif ne voit que les lignes de son groupe
-- courant. (kombe_app est créé hors de cette migration par le provisionneur.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'membership','role_assignment','rule_version','rules_acceptance','round',
    'obligation','contribution','disbursement','vote','dispute','journal'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (group_id = current_setting(''kombe.group_id'', true))',
      t
    );
  END LOOP;
END $$;

COMMIT;

-- NOTE D'EXÉCUTION : ce fichier est un CONTRAT de schéma. Son application et
-- sa preuve (verrous réels, RLS sur kombe_app non-superuser, tests de pool
-- 100 requêtes A/B) relèvent de C01 sur PostgreSQL 16+ réel via Testcontainers.
-- Sans base disponible, `pnpm --filter @kombe/db migrate` renvoie BLOCKED (2).
