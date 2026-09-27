-- KÓMBE C02 — Migration ADDITIVE : accès des comptes (états d'identité, jetons
-- de vérification à usage unique et expirants, sessions révocables). Complète
-- 0001_init.sql et 0002_role_change.sql sans les modifier.
--
-- CONTRAT de persistance (C02). Son APPLICATION et sa PREUVE (unicité d'usage
-- du jeton sous verroi, suppression en cascade des sessions par génération,
-- RLS effective, absence de secret en clair) exigent une PostgreSQL 16+ RÉELLE
-- (lot C02 d'exécution). Sans base, `pnpm --filter @kombe/db migrate` renvoie
-- BLOCKED (2). Aucune donnée réelle ; uniquement des fixtures fictives.
--
-- Backfill / reprise : purement additive (nouvelles tables) donc rejouable ;
-- elle ne réécrit aucune ligne existante. BEGIN/COMMIT ⇒ pas d'effet partiel.
-- Retour arrière : 0003_access.down.sql.
--
-- Sécurité (1.2, 1.4) : ni mot de passe, ni OTP, ni jeton en CLAIR — uniquement
-- des EMPREINTES (hash). La décision de validité est serveur ; la base garantit
-- l'unicité et les bornes de temps, jamais elle ne « choisit » un privilège.

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── État d'accès global d'une identité (1.1, 1.2, 1.3, 1.5) ──────────────────
-- Table GLOBAL-identité (sans group_id) : le compte vit au-dessus des groupes.
CREATE TABLE identity_access (
  identity_id         text PRIMARY KEY REFERENCES identity(identity_id),
  state               text NOT NULL DEFAULT 'pending_verification'
                      CHECK (state IN ('pending_verification','active','suspended','closed')),
  channel_verified    boolean NOT NULL DEFAULT false,
  mfa_enrolled        boolean NOT NULL DEFAULT false,
  is_operator         boolean NOT NULL DEFAULT false,
  -- Génération de sessions : incrémentée pour révoquer d'office toute session
  -- antérieure (récupération). Une session n'est valide que si sa `generation`
  -- égale cette valeur courante (contrôle serveur, jointure access_session).
  session_generation  integer NOT NULL DEFAULT 1 CHECK (session_generation >= 1),
  -- Suspension temporaire des privilèges après récupération (ADR-0012).
  recovery_lock_until timestamptz,
  -- Empreinte du mot de passe (hachage coûté, hors domaine), jamais le mot de
  -- passe lui-même. NULL = compte sans mot de passe (ex. jeton seule).
  password_hash       text CHECK (password_hash IS NULL OR password_hash <> ''),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Jeton de vérification à usage unique et expirant (1.1, 1.4) ──────────────
CREATE TABLE verification_token (
  token_id     text PRIMARY KEY,
  identity_id  text NOT NULL REFERENCES identity(identity_id),
  purpose      text NOT NULL CHECK (purpose IN ('registration','recovery')),
  channel      text NOT NULL CHECK (channel IN ('email','phone')),
  token_hash   text NOT NULL CHECK (token_hash <> ''),  -- jamais le code clair
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  CHECK (expires_at > issued_at)
);

-- Un jeton ne sert qu'une fois : la consommation est un
--   UPDATE verification_token SET consumed_at = now()
--   WHERE token_id = $1 AND consumed_at IS NULL
-- sous verrou de ligne ; zéro ligne touchée ⇒ déjà consommé. De plus, au plus
-- UN jeton non consommé par (identité, finalité) : un nouveau code évince
-- l'ancien (index partiel unique), ce qui borne le nombre de codes valables
-- simultanés.
CREATE UNIQUE INDEX one_active_token_per_subject
  ON verification_token (identity_id, purpose)
  WHERE consumed_at IS NULL;

-- ── Session révocable, liée à une génération du compte (1.2) ─────────────────
CREATE TABLE access_session (
  session_id  text PRIMARY KEY,
  identity_id text NOT NULL REFERENCES identity(identity_id),
  generation  integer NOT NULL CHECK (generation >= 1),
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  CHECK (expires_at > issued_at)
);

CREATE INDEX access_session_by_identity ON access_session (identity_id, generation);

-- ── RLS (défense additionnelle ; preuve réelle BLOCKED) ──────────────────────
-- Ces tables sont GLOBAL-identité. Le serveur ouvre la transaction
-- d'authentification/résolution puis pose SET LOCAL kombe.identity_id = <id
-- résolue serveur>, et n'expose JAMAIS une ligne d'autrui : une politique
-- self-scope refuse toute lecture dont l'identité ne correspond pas au
-- contexte. La résolution d'identité précède ce réglage et passe par le rôle
-- de service kombe_app sous contrôle applicatif strict (jamais un identifiant
-- fourni tel quel par le client).
ALTER TABLE identity_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_session ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['identity_access','verification_token','access_session'] LOOP
    EXECUTE format(
      'CREATE POLICY self_scope ON %I USING (identity_id = current_setting(''kombe.identity_id'', true))',
      t
    );
  END LOOP;
END $$;

COMMIT;

-- NOTE : ce fichier est un CONTRAT. Voir packages/db/README.md et
-- DICTIONNAIRE.md pour l'application, le provisionnement et les tests réels
-- (unicité d'usage sous verroi, révocation par génération, RLS) — BLOCKED sans
-- PostgreSQL 16+ réel.
