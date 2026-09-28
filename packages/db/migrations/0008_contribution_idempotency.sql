-- KÓMBE C06 — Déclarations partielles et idempotence durable (stories 6.1, 6.9,
-- 18.1, 18.2, 18.3). Migration **additive** sur le socle 0001, sans redéfinir
-- `obligation`/`contribution`/`command`/`outbox`. Elle encode : le **registre
-- durable d'idempotence** scopé acteur/groupe/type/clé avec **hash de corps**
-- (rejeu vs conflit 409), les **champs de preuve** de la déclaration (canal,
-- référence, motif, date alléguée vs date serveur), et laisse la **capacité
-- sous verrou** gardée par le CHECK hérité de 0001
-- (`validated_net <= active_reserved <= due_amount` = excédent bloqué). La
-- résolution de décision (hash, rejeu/conflit, réservation) reste côté serveur
-- (`packages/domain/src/contribution.ts`) ; la base ne fait que **rendre
-- durable et incompressible** le registre et **borner structurellement** les
-- montants. À rejouer sur PostgreSQL réel ; **BLOCKED** sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Registre durable d'idempotence (18.1) : une ligne posée = une commande
--    appliquée. La clé est scopée (acteur, groupe, type) pour qu'une même
--    chaîne réutilisée par un autre acteur ne touche pas ce résultat. Le
--    `body_hash` canonique distingue rejeu (identique) et conflit (corps
--    différent) — le conflit est décidé par le serveur, la base garantit la
--    durabilité et l'unicité (pas de double écriture après timeout/coupure).
CREATE TABLE idempotency_registry (
  registry_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_identity_id  text NOT NULL,
  group_id           text NOT NULL REFERENCES "group"(group_id),
  command_type       text NOT NULL,
  idempotency_key    text NOT NULL,
  body_hash          text NOT NULL CHECK (body_hash ~ '^[0-9a-f]{64}$'),
  command_id         text REFERENCES command(command_id),
  result_status      text NOT NULL CHECK (result_status IN ('applied')),
  result_version     integer CHECK (result_version IS NULL OR result_version >= 1),
  event_hash         text CHECK (event_hash IS NULL OR event_hash ~ '^[0-9a-f]{64}$'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Une seule exécution appliquée par (acteur, groupe, type, clé).
  UNIQUE (actor_identity_id, group_id, command_type, idempotency_key),
  UNIQUE (group_id, registry_id)
);

-- Append-only du registre : le chemin applicatif insère une fois, ne modifie
-- ni n'efface jamais une réservation posée (sinon on pourrait réarmer une
-- double dépense). Réutilisation du drapeau de maintenance tracée C11.
CREATE TRIGGER idempotency_registry_append_only
  BEFORE UPDATE OR DELETE ON idempotency_registry
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

-- Moindre privilège : les default privileges de roles.sql grantent
-- SELECT/INSERT/UPDATE/DELETE à kombe_app sur toute table nouvelle. La
-- réservation durable exige INSERT+SELECT, JAMAIS UPDATE/DELETE applicatif.
REVOKE UPDATE, DELETE ON idempotency_registry FROM kombe_app;

-- RLS : isolation tenant en lecture/écriture (défense additionnelle, testée
-- réellement en C01 sur kombe_app non-superuser).
ALTER TABLE idempotency_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON idempotency_registry
  USING (group_id = current_setting('kombe.group_id', true));

-- 2) Colonnes d'exposition du statut de commande (18.1/18.2) sur `command`
--    (déjà porteur de `idempotency_key UNIQUE` et `status`). Nullables : reste
--    rejouable sans backfill sur des commandes déjà posées (base de test vide).
ALTER TABLE command
  ADD COLUMN actor_identity_id text,
  ADD COLUMN command_type      text,
  ADD COLUMN body_hash         text CHECK (body_hash IS NULL OR body_hash ~ '^[0-9a-f]{64}$');

-- 3) Champs de preuve de la déclaration (6.1). `server_date` (horodatage
--    injecté par le serveur) est DISTINCT de `alleged_date` (affirmation
--    client). Une référence ne prouve jamais l'authenticité d'un paiement
--    externe ; le canal électronique sans référence exige un motif non vide
--    (borné structurellement ci-dessous ; la règle de décision reste serveur).
ALTER TABLE contribution
  ADD COLUMN channel       text CHECK (channel IS NULL OR channel IN ('cash','electronic')),
  ADD COLUMN reference     text,
  ADD COLUMN justification text,
  ADD COLUMN alleged_date  date,
  ADD COLUMN server_date   timestamptz,
  ADD CONSTRAINT contribution_electronic_reference
    CHECK (
      channel IS DISTINCT FROM 'electronic'
      OR reference IS NOT NULL
      OR (justification IS NOT NULL AND btrim(justification) <> '')
    );

-- 4) Excédent bloqué : le CHECK hérité de 0001 sur `obligation`
--    (`active_reserved <= due_amount`) interdit déjà, en base, toute réservation
--    au-delà du dû — un INSERT de déclaration qui ferait dépasser la capacité est
--    refusé par la contrainte, sous le verrou de la ligne (SELECT … FOR UPDATE).
--    Rien n'est redéfini ici : le contrat C06 s'appuie sur cette borne.

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C06. Ses preuves RÉELLES — unicité de la
-- clé scopée (deux INSERT simultanés sur la même (acteur,groupe,type,clé) ⇒ un
-- seul appliqué), rejeu après timeout (même corps ⇒ même résultat, compte de
-- contributions = 1), conflit corps différent (409), excédent refusé par le CHECK
-- sous verrou (deux courses de 3000 sur 5000 ⇒ total accepté 3000), et atomicité
-- événement/projection/outbox (crash entre les deux ⇒ `partial_commit_count = 0`,
-- scénarios C06-REPLAY / C06-BODY / C06-RACE de `tests/isolation.pg.mjs`) —
-- exigent PostgreSQL 16+. Sans base, exécution **BLOCKED** (code 2) : voir
-- packages/db/README.md. Aucune donnée réelle.
