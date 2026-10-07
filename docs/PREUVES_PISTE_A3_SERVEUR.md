# Preuves & revue — Piste A3 (câblage `server.ts`/HTTP en mode réel) · KÓMBE

- **Commit de base (HEAD au moment du travail) :** `4096e1b` (Piste A2 suite / ADR-0024)
- **Harnais producteur :** `claude-code` (préprod, hors gouvernance H06 — pas de `done` auto-signé)
- **Objet :** cabler les routes HTTP existantes sur `PgAccessStore`/`PgContributionStore` +
  authentification par session réelle (`resolveSession`/`resolveGroupActor`), pour le
  périmètre : **connexion (login) + déclaration/vue de cotisation**. C'était le bloqueur
  explicite laissé ouvert par `docs/PREUVES_PISTE_A1.md`/`PREUVES_PISTE_A2_ACCESS.md` §6/7 :
  les stores réels étaient prouvés en standalone, jamais atteignables par une requête HTTP.
- **Date :** 2026-10-07.
- **Déclencheur :** demande explicite — mobile/PWA/dashboards fonctionnels sans
  heuristique/émulation/simulation. Audit préalable (agent read-only) a confirmé qu'aucune
  des 3 surfaces front ne peut devenir réelle tant que `server.ts` sert exclusivement des
  stores fictifs : ce lot est le préalable obligatoire, avant tout câblage front.

## 1. Inspecter

- `server.ts` construisait TOUJOURS les 15 stores `Fictitious*` ; `actorFrom` faisait
  confiance à un en-tête `x-actor` fourni PAR LE CLIENT, sans aucune vérification serveur.
- `PgAccessStore`/`PgContributionStore` (Piste A1/A2 suite) et `resolveSession`/
  `resolveGroupActor` (Piste A2) existaient, prouvés en base réelle, mais **jamais appelés
  depuis une route HTTP** — limite documentée explicitement dans les deux preuves
  précédentes.
- Le contrat HTTP `{identityId, code}`/`{identityId, channel}` des routes d'inscription/
  récupération est **déjà identique** entre store fictif et réel (même signature, async en
  plus) : branchement direct possible sans changer schémas ni routes existantes.
- La route de connexion fictive existante (`POST /v1/access/sessions`) accepte un
  `sessionId` FOURNI PAR LE CLIENT — contrat volontairement non touché (ADR-0024 §limites).
  Le mode réel a donc besoin de ses PROPRES routes de connexion.

## 2. Contractualiser

### `packages/api/src/schemas.ts`
- `loginRequest = z.object({ identityId })`, `loginCompletion = z.object({ identityId, code })`
  — même forme que `recoveryRequest`/`registrationVerification`.

### `packages/api/src/server.ts`
- `BuildAppOptions` : `+pool?: pg.Pool`, `+emailSender?: EmailSender`. Absent (défaut) :
  comportement 100% inchangé, tous les tests existants passent sans modification.
- `requireResendSender()` : construit `ResendEmailSender` depuis `RESEND_API_KEY`/
  `KOMBE_EMAIL_FROM` — **échec explicite** (throw) si la clé est absente alors qu'un `pool`
  est fourni (jamais un repli silencieux sur un expéditeur fictif en mode réel).
- `realGroupActorFrom(pool, request, groupId)` : lit `Authorization: Bearer <sessionId>`,
  résout l'identité (`resolveSession`) PUIS l'adhésion/rôle dans le groupe ciblé
  (`resolveGroupActor`), dans **une seule transaction courte** dédiée à l'authentification.
  Absence/malformation de l'en-tête → `SESSION_INVALID` (même code qu'une session invalide,
  non-divulgation).
- Routes **branchées** (même chemin HTTP, bascule interne sur `pool`/`realAccess`) :
  `POST /v1/access/registrations`, `.../registrations/verifications`,
  `.../recovery-requests`, `.../recovery-completions`, `GET .../operators/:id/privilege`,
  `POST /v1/groups/:groupId/declarations`, `GET /v1/groups/:groupId/obligations/:id`.
- Routes **additives** (n'existent QUE si `pool` fourni — jamais un 404 masqué derrière un
  faux succès en mode fictif) : `POST /v1/access/login-requests`,
  `POST /v1/access/login-completions` (`sessionId` toujours généré serveur).
- Route fictive de connexion (`POST /v1/access/sessions`, `sessionId` client) : **non
  touchée**, continue de servir uniquement `FictitiousAccessStore`.

### `packages/api/src/main.ts`
- Construit un `pg.Pool` (`createApiPool`) SEULEMENT si `KOMBE_API_DATABASE_URL` est posée
  (`readApiDatabaseUrl`) et le passe à `buildApp`. Message de démarrage distinct
  (« mode RÉEL » vs « stores fictifs ») — jamais un mode réel silencieux.

### `.env.example`
- `+KOMBE_EMAIL_FROM` (défaut documenté : `onboarding@resend.dev`, limite sandbox Resend
  sans domaine vérifié explicitée), `+KOMBE_API_DATABASE_URL` (commentaire : absente par
  défaut ⇒ API fictive).

## 3. Construire & tester (commandes RÉELLEMENT exécutées)

```
pnpm --filter @kombe/domain build && pnpm --filter @kombe/api build   → exit 0
pnpm -r build / typecheck / test                                      → exit 0 partout
python COORDINATION_MULTI_HARNESS/verifier_coordination.py             → PASS, exit 0
```

`pnpm -r test` : **543 tests** (343 domaine + 200 API), **zéro régression** — tous les
tests existants continuent d'exercer les stores fictifs par défaut, comportement inchangé
octet pour octet (`BuildAppOptions.pool` absent partout dans les suites vitest actuelles).

## 4. Éprouver — preuve base réelle (Neon, branche jetable `preview-piste-a-claude`)

Script dédié : `packages/api/test/serverRealMode.proof.mjs`. Exerce le serveur Fastify
RÉEL (`buildApp({ pool, emailSender })`, même code qu'en production) via `.inject()` —
pas de port réseau nécessaire, mêmes routes, même pipeline d'erreurs. `NullEmailSender`
(jamais un envoi réel avant G0, STACK.md §4) :

```
KOMBE_API_DATABASE_URL=postgresql://neondb_owner:***@ep-dry-wildflower-b19ptfwl.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require \
  node packages/api/test/serverRealMode.proof.mjs
→ exit 0
```

| ID | Attendu | Obtenu (réel) |
|---|---|---|
| **A3-REGISTER** | inscription HTTP → code (capturé via le double de test) → vérification HTTP → compte actif | `state=active` ✅ |
| **A3-LOGIN** | lien magique HTTP → `sessionId` généré SERVEUR (UUID) | longueur 36 ✅ |
| **A3-DECLARE** | `POST .../declarations` avec `Authorization: Bearer <sessionId RÉEL>` → 201, événement scellé, capacité réservée | `status=applied, availableToDeclare=60000` (100000 dû − 40000 réservé) ✅ |
| **A3-DECLARE-NOAUTH** | même route SANS `Authorization` → refus | `401 SESSION_INVALID` ✅ |
| **A3-DECLARE-FOREIGN** | session valide mais SANS adhésion dans le groupe ciblé → refus anti-IDOR | `403 FEATURE_PILOT_FORBIDDEN` ✅ |
| **A3-VIEW** | `GET .../obligations/:id` authentifié → capacité/restant dû reflètent la déclaration | `activeReserved=40000, contributionCount=1` ✅ |
| **A3-FICTIF-INTACT** | `buildApp()` SANS `pool` → squelette fictif inchangé | `phase=c00-skeleton` ✅ |

Ce scénario **boucle les Pistes A1/A2/A2-suite** : une session issue d'un login HTTP réel
authentifie une déclaration HTTP réelle qui écrit un événement scellé et une réservation
sous verrou en base réelle — la chaîne complète (inscription → connexion → déclaration →
vue) est maintenant prouvée de bout en bout **par la route HTTP elle-même**, plus
seulement par les stores en standalone.

## 5. Revue (auto-relecture avant livraison — pas un `done` H06)

Deux obstacles réels rencontrés en exécution (pas en relecture statique) :

- **Ligne `purpose='login'` résiduelle** d'une preuve antérieure (`pgAccessStore.proof.mjs`)
  bloquait le DOWN de la migration `0019` (ancien CHECK n'autorisant pas `login`) —
  nettoyée par une requête ponctuelle avant la preuve (même classe de problème déjà
  rencontrée et documentée en Piste A2 suite, pas un nouveau défaut de ce lot).
- **FK manquante `obligation.round_id`** : la fixture initiale omettait la ligne `round` —
  détecté par l'échec réel de l'INSERT (FK `obligation_group_id_round_id_fkey`), corrigé en
  ajoutant la fixture `round` manquante, exactement comme `pgContributionStore.proof.mjs`
  le fait déjà.

Aucun bug de LOGIQUE métier trouvé dans ce lot — la logique (décisions pures, deux-phases
verify/effect, hash/lockout) était déjà prouvée par les lots précédents ; ce lot ne fait que
la RENDRE ATTEIGNABLE par HTTP, sans la modifier.

## 6. Limites assumées (ce que cet incrément NE fait PAS)

- **Périmètre réel = connexion + déclaration/vue de cotisation UNIQUEMENT.** Les 12 autres
  domaines (gouvernance, règles, calendrier, validations, litiges, décaissements,
  propositions, support, export, vie privée, métriques, rôles) restent servis par leurs
  stores `Fictitious*` même quand `pool` est fourni — pas encore câblés, pas dans le
  périmètre déjà prouvé base réelle.
- **`ResendEmailSender` toujours jamais exercé réellement** (`NullEmailSender` dans la
  preuve, conformément à STACK.md §4 — aucun message réel avant G0). `main.ts` l'utilisera
  par défaut en production SEULEMENT après G0.
- **Brouillon (`POST /v1/groups/:id/drafts`) reste fictif** même en mode réel — hors du
  périmètre déclaré (action sans effet, moindre urgence).
- **Un seul round-trip réseau par route réelle protégée** (authentification dans sa propre
  transaction, puis une seconde transaction pour l'effet métier) : cohérent avec le motif
  déjà établi (`pgSessionResolver.proof.mjs`), pas une micro-optimisation à faire maintenant.
- **Aucun fichier `harness/` touché.**

## 7. Prochaine dépendance

1. Démarrer un service réel (`KOMBE_API_DATABASE_URL` posée) joignable par un front, pour
   que dashboards/PWA/mobile puissent réellement l'atteindre (reste à faire : choix
   d'hébergement temporaire pour la démonstration du jour, distinct du déploiement Vercel
   définitif post-G0).
2. Câbler UNE surface front sur ce périmètre réel (dashboard groupe-admin : le plus proche,
   déjà `fetch()` réel, cf. audit préalable) — remplacer l'en-tête `x-actor` par
   `Authorization: Bearer` + les nouvelles routes de connexion réelles.
3. Répéter pour PWA (aucune couche réseau existante) et mobile (couche HTTP existante mais
   non câblée dans le graphe de dépendances — `Unavailable*Repository` à remplacer).
