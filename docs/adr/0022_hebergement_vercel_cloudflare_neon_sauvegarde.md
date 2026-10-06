# ADR-0022 — Trio d'hébergement Vercel + Cloudflare + Neon, sauvegarde indépendante et reprise

- **Statut :** ADOPTÉ — décision humaine du 2026-10-06 (signature du porteur). L'architecture et le plan de sauvegarde/reprise font foi ; les **conditionnants opérationnels avant G0** (§Conditionnants avant G0) restent à exécuter — adoption ≠ exécution d'un exercice réel ni souscription d'un service payant.
- **Auteur :** Lead C00, sur proposition qoder • **Date :** 2026-10-06
- **Décisions concernées :** remplace `[OPEN-D01]` (hébergement app + worker) ; complète `[OPEN-D02]` déjà tranché par `ADR-0021` (Neon comme Postgres géré) ; tranche `[OPEN-D08]` (RPO) et `[OPEN-D09]` (fournisseur de sauvegarde indépendante) ; cadre `[OPEN-D10]` (région primaire) sans le fermer — la mesure depuis le Cameroun reste à exécuter.
- **Origine documentaire :** `PLAN_GLOBAL_DEPLOIEMENT.md` §3 (stack de référence), §4 (environnements/comptes), §7 (sauvegarde/reprise), §8 (objectifs RPO/RTO/backup) ; `02_Technologies/TECHNOLOGIES_ET_ALTERNATIVES.md` TEC01 (Vercel), TEC04 (Neon), TEC11/TEC12 (Workers, R2) ; `ZONES_NOIRES_ET_GRISES.md` ZN03, ZN05, ZG08 ; prompts **C28** (chaîne de livraison) et **C29** (infrastructure sauvegarde/reprise, stories 14.6 / 18.10 / 18.18).
- **Ce que cet ADR ne fait pas :** il ne change aucun invariant métier. Il ne touche pas à la canonicalisation RFC 8785 (`ADR-0003`), au journal append-only et à sa chaîne de hash (`ADR-0004`, `ADR-0016`), à l'isolation RLS et aux rôles PostgreSQL sans `BYPASSRLS` (`ADR-0007`), à l'idempotence sous verrou (`ADR-0017`), ni au statut `BLOCKED` de la porte `G-CONSTRUCTION` (`ADR-0010`). Il ne souscrit à **aucun** fournisseur : il nomme une cible technique et décrit l'exercice de preuve qui devra être réellement exécuté.

## Contexte et problème

Avant cet ADR, le dossier ne désigne pas de cible d'hébergement :

- `STACK.md` §2 `[OPEN-D01]` liste trois options sans arbitrage (Render payant, Vercel commercial, VPS conteneurisé) ;
- `PLAN_GLOBAL_DEPLOIEMENT.md` §3 propose « Render web + worker » en référence ; `[OPEN-D09]` propose Backblaze B2 « par exemple » sans engagement ;
- `ADR-0021` a arrêté **l'hébergement PostgreSQL** sur Neon, mais laisse `OPEN-D09` et `OPEN-D10` explicites (§Conséquences de cet ADR) ;
- C29 impose trois scénarios (`C29-RESTORE`, `C29-RIGHTS`, `C29-OUTBOUND`) qui ne peuvent pas s'évaluer sans un triple : (i) où s'exécute l'API Fastify, (ii) où s'exécute le worker outbox avec son verrou par scope (`ADR-0017`), (iii) où vivent les sauvegardes **hors du compte applicatif**.

Une cible d'hébergement unique (VPS, Render, ou Vercel seul) ne satisfait pas la contrainte « backups hors compte applicatif » sans un second fournisseur, et ne fournit pas nativement le verrou `scope-clé → singleton` requis par `ADR-0017` pour le worker.

## Décision proposée

**Trio applicatif** — chaque couche a un fournisseur distinct, avec séparation de compte, de projet et de secrets :

| Couche | Cible | Rôle exact | Ce qu'elle ne fait **pas** |
|---|---|---|---|
| Front statique et PWA | **Vercel** (Edge CDN, projet par app) | `packages/client` (PWA React/Vite), `apps/dashboard-{direction,engineering,group-admin,operations}` — build Vite, fonctions Node si nécessaire | Aucun accès direct à Neon. Aucun token d'écriture. |
| API de commandes | **Vercel Node.js Runtime** (Node 22) exécutant `packages/api` (Fastify ≥ 5) Derrière **Cloudflare** en frontal (DNS + WAF + rate-limit + Turnstile sur les routes publiques) | Commands, auth applicative `C02`, RLS par requête, transactions `pg` manuelles (`ADR-0005`/`ADR-0006`/`ADR-0007`) | Ne joue pas le rôle du worker outbox. N'envoie aucun message externe. |
| Worker outbox | **Cloudflare Workers** avec un **Durable Object** par `scope_id` (tenant × ressource), connexion PostgreSQL via **Hyperdrive** vers Neon | Draine la table outbox transactionnelle (`ADR-0008`), applique le verrou capacité/idempotence (`ADR-0017`), émet vers les frontières externes (mail/SMS/stockage) | Aucune écriture de domaine métier. Pas `BYPASSRLS`. N'est pas déployé dans l'environnement de reprise isolée. |
| Base PostgreSQL | **Neon** — projet `square-resonance-19892972`, branche `production` (`ADR-0021` inchangé) | Source de vérité ; PITR activé ; branches `preview` / `staging` / `production` comme environnements distincts | N'authentifie pas les utilisateurs (`OPEN-D06` reste ouvert). `auth: true` du scaffold `neon.ts` n'est pas activé. |
| Sauvegarde indépendante | **Cloudflare R2** (bucket S3-compat, versioning + **Object Lock** mode COMPLIANCE) dans un **autre compte Cloudflare** que celui des Workers applicatifs | Copie des dumps `pg_dump` + WAL archive (pgBackRest ou équivalent validé en C29), manifests et exports, **registre des révocations/effacements** hors du point de restauration | Ne contient aucun secret applicatif. N'est pas montable en lecture par l'API ou le worker. |
| Frontal réseau | **Cloudflare** (zone DNS + WAF + rate-limiting + Turnstile + Bot Fight) | Protection de surface, journal d'erreurs expurgées, cache HTTP sur les réponses publiques | Ne remplace pas l'autorisation RBAC objet (`ADR-0006`) — contrôle applicatif serveur inchangé. |

## Rôles PostgreSQL et cloisonnement (rappel + effet du trio)

Les rôles définis par `packages/db` (`kombe_migrateur`, `kombe_app`, `kombe_worker`, aucun `BYPASSRLS`, `DEFAULT PRIVILEGES` — cf. mémoire « Neon-safe provisioning ») sont appliqués à l'identique sur Neon. Chaque rôle est **monté sur un seul composant** :

| Rôle | Monté sur | Circuits réseau |
|---|---|---|
| `kombe_migrateur` | GitHub Actions (job `migrate`, auto-hébergé, IP allowlist Neon) | Direct Neon, jamais partagé avec l'app |
| `kombe_app` | Vercel Functions (API) via le pooler Neon **direct** (pas pooled) pour `SET LOCAL role` transactionnel — cf. mémoire « pooled vs direct SET ROLE » | Session transactionnelle |
| `kombe_worker` | Cloudflare Workers Durable Object via **Hyperdrive** | Un seul DO par `scope_id`, verrou naturel |
| KMS/Backup | Un **troisième compte** (Cloudflare Objects Lock + secret hors repo) | Push uniquement depuis le job `backup` CI, jamais depuis l'app |

Aucun secret n'est commité ; la rotation des credentials Neon se fait par `neon rotate` et l'application via les secrets managés Vercel et Cloudflare (`wrangler secret put`). Le scaffold `neon.ts`/`hello.ts` et le bucket `uploads` du projet Neon restent **non exposés**, conformément à `ADR-0021` §Hors-périmètre.

## Plan de sauvegarde (ferme `[OPEN-D09]`)

**Règle directrice :** « backups hors compte applicatif » (`PLAN_GLOBAL_DEPLOIEMENT.md` §7). Le bucket R2 de sauvegarde est dans un **autre compte Cloudflare**, sans rôle d'aucun composant applicatif, avec Object Lock COMPLIANCE (rétention minimale 35 jours, alignée sur PITR Neon) et versioning.

Périmètre de chaque cycle de sauvegarde :

1. **Base** — dump logique `pg_dump` (schéma + données, chiffré côté client avec clé KMS séparée), **plus** WAL archive continue pour PITR. Le PITR Neon couvre les besoins « perte ≤ 15 min » ; la copie R2 couvre le scénario « compte Neon indisponible ou erreur destructrice ».
2. **Objets métier** — les fichiers exportés par `C12` (exports téléchargeables) et toute pièce conservée selon les durées documentées (`18.10`) ; bucket applicatif séparé, jamais le bucket `uploads` du scaffold.
3. **Registre des révocations/effacements** — table `revocations` et ses hachages canoniques **RFC 8785** (`ADR-0003`) dupliqués vers le bucket R2 de sauvegarde **avant** chaque cycle. Ce registre est la source qui rend `C29-RIGHTS` observable : sans lui, une restauration peut réintroduire une session révoquée.
4. **Manifestes** — un JSON canonique horodaté listant SHA-256 de chaque artefact, le SHA du commit déployé, la version de schéma (`schema_migrations`), et l'empreinte de la chaîne de hash du journal (`ADR-0004`, `ADR-0016`). Ce manifeste est **signé** par la clé de sauvegarde, et son empreinte est republiée dans le dépôt public (sans secrets) pour preuve.
5. **Configuration non sensible** — plans de rôle/grants, politiques Vercel, bindings Workers (via export `wrangler`), règles WAF versionnées dans Git.

**Alternatives rejetées pour `[OPEN-D09]` :**

- **Backblaze B2** (proposé « par exemple » dans `PLAN_GLOBAL_DEPLOIEMENT.md` §7) — non rejeté sur le fond, mais R2 est retenu pour (i) API S3-compat, (ii) **egress à zéro** — indispensable quand une reprise télécharge des dumps entiers, (iii) Object Lock natif, (iv) panneau unique avec le reste du réseau applicatif. B2 reste alternative testée si les quotas de rétention ou un audit contractuel l'exigent.
- **S3 standard AWS** — rejeté pour coût egress et multiplicité des IAM ; pas d'avantage décisif ici.
- **Stocker les dumps dans le même compte Neon ou le même compte Cloudflare que l'application** — rejeté : violerait la règle « backups hors compte applicatif » et rendrait un incident de compte total en perte de reprise.
- **Compter sur PITR Neon seul** — rejeté : PITR couvre une erreur de base, pas une indisponibilité de compte ou un fournisseur. `ZG08` exige une copie **indépendante**.

## RPO / RTO (ferme `[OPEN-D08]`)

| Paramètre | Valeur active | Preuve exigée avant G0 |
|---|---|---|
| RPO nominal | **≤ 15 min** (PITR Neon + WAL streaming) | Trois restaurations successives sur projets Neon isolés, écart mesuré et journalisé |
| RPO plancher contractuel | ≤ 1 h (cible renforcement documentée en `DECISIONS_ET_VERSION.md` D07) | Idem, avec coupure réseau simulée sur le push WAL |
| RTO nominal | **≤ 4 h** (restauration PITR Neon, redéploiement Vercel/Workers pointant sur le nouveau point) | Chronométrage réel, réseau sortant coupé |
| RTO mode dégradé | ≤ 8 h (reconstruction Postgres frais depuis dump R2 + WAL archive) | Exercice trimestriel, documenté dans `RUNBOOK_INCIDENT_ET_REPRISE.md` |
| RPO « risque accepté » | 24 h — **non retenu** : `ZG08` demandait de trancher ; cet ADR tranche en faveur de la proposition D07 (≤ 1 h renforcée à ≤ 15 min nominal) | — |

L'objectif source (story 14.6 : RPO ≤ 24 h, RTO ≤ 8 h) reste le **plancher de documentation** : il n'est pas la cible opérationnelle. La cible active est celle du tableau ci-dessus, et toute valeur annoncée publiquement doit être appuyée par un exercice réellement exécuté, pas par une promesse fournisseur.

## Failover et continuité

- **Neon** : bascule AZ automatique dans la région primaire choisie (voir §Région). `ADR-0021` conserve le projet unique `square-resonance-19892972` — la branche `production` est la seule à recevoir des écritures réelles.
- **Vercel** : les fonctions s'exécutent multi-région par construction ; le front statique est edge-global. En cas de panne du fournisseur, un plan `deploy alternative` est décrit dans `RUNBOOK_INCIDENT_ET_REPRISE.md` (build Vite vers R2 + Worker de reverse-proxy) ; ce fallback est **testé**, pas seulement documenté.
- **Cloudflare Workers / Durable Objects** : exécution globale. Pour un `scope_id` donné, le DO réplique son état ; si l'instance tombe, une nouvelle est réélue avec le même verrou. La sémantique exactly-once-per-scope (`ADR-0017`) est préservée.
- **Santé applicative** : un endpoint `/healthz` côté API lit Neon sous le rôle `kombe_app` avec un timeout court ; si échec, l'API répond `503` + `Retry-After` et le worker passe en mode « consommer mais ne pas envoyer » (aucun effet externe). Ce mode est déclenchable **manuellement** par un flag versionné et n'active jamais de feature P1+ côté serveur (`STACK.md` §4, règle « fonctionnalités désactivées côté serveur »).
- **Frontal** : en cas de panne Vercel côté API, le WAF Cloudflare sert une page de maintenance statique depuis R2 ; les dashboards `apps/*` (Vercel) peuvent rester accessibles car la panne n'est pas corrélée.

## Région primaire (`[OPEN-D10]` : cadre posé, mesure requise)

Cet ADR **ne ferme pas** `OPEN-D10` : il fixe la **méthode** et désigne deux candidats.

- **Candidats** : Neon `AWS eu-west-3` (Paris) ou `AWS eu-central-1` (Francfort). Les deux sont testés.
- **Mesure obligatoire** depuis Douala et Yaoundé (latence p50/p95 aller-retour, perte de paquets, variance heures ouvrées vs nuit) **avant** toute écriture de données réelles, exécutée par la phase P3 du plan.
- **Critère d'acceptation** : `p95 API` compatible avec le SLA §8 de `PLAN_GLOBAL_DEPLOIEMENT.md` (< 700 ms serveur + RTT réseau). Si aucun des deux candidats n'atteint le SLA, une décision complémentaire nomme un point de présence plus proche (Maroc, Île-de-France, ou autre).
- **Aucun pays n'est présumé « conforme » par son nom** : la règle de `PLAN_GLOBAL_DEPLOIEMENT.md` §3 est conservée telle quelle.

## Environnements et comptes (aligné sur `PLAN_GLOBAL_DEPLOIEMENT.md` §4)

| Environnement | Neon | Vercel | Workers / R2 | Données |
|---|---|---|---|---|
| Local | `branch preview` Neon (via `neon branches`) | `vc dev` | `wrangler dev` + R2 local (`miniflare`) | fixtures fictives uniquement |
| CI / preview PR | copie `copy-on-write` Neon par PR (branches natives, cf. `ADR-0021` §Pourquoi Neon) | deployment preview Vercel par PR, jeton éphémère | Workers preview URL, bindings sandbox | synthétiques |
| Staging | branche `staging` séparée | projet Vercel staging dédié | Worker bound staging, R2 staging | synthétiques, miroir de schéma |
| Production | branche `production` (projet `square-resonance-19892972`) | projet Vercel prod, MFA organisation | Worker bound prod, R2 prod bucket | réelles après porte G0 uniquement |
| Reprise isolée | nouveau projet Neon temporaire (jetable) | non déployé | **worker absent** ou en `KOMBE_DRY_RUN=1` forcé, réseau sortant coupé | copie restaurée protégée |

Chaque projet Vercel / Workers / Neon / R2 est **séparé**, avec son propre budget plafonné et ses propres alertes (règle §10 du plan) ; aucun administrateur commun sans MFA et sans suppléant nommé (`18.18`).

## Cartographie avec les scénarios C29 et C28

| ID scénario (C29/C28) | Réalisation sur le trio | Observation attendue |
|---|---|---|
| `C29-RESTORE` | Restauration PITR Neon **ou** dump+ WAL depuis R2 vers un projet Neon jetable ; le registre des révocations est réappliqué **avant** ouverture | `restore_verified = true`, avec SHA du manifeste et empreinte chaîne de hash recalculées |
| `C29-RIGHTS` | Une session révoquée **avant** le point de restauration doit rester refusée après reprise, grâce au registre `revocations` séparé dans R2 | `revoked_session_accepted = false` (cf. `ADR-0012`) |
| `C29-OUTBOUND` | Rejouer l'outbox dans l'environnement de reprise où le **worker n'est pas déployé** et où `KOMBE_DRY_RUN=1` est vérifié au démarrage | `external_messages_sent = 0` |
| `C28-MISSING` | Le job CI `verify-gate` refuse toute release si le manifeste de sauvegarde le plus récent n'est pas présent ou ne hache pas le commit courant | `harness_exit = 2` |
| `C28-FAILURE` | Une assertion financière volontairement fausse est injectée sur Neon `preview` ; le runner H00 et le job `restore-verify` doivent tous deux échouer | `failure_detected = true` |
| `C28-GATE` | Une preuve manquante (SBOM, manifeste de sauvegarde, ou preuve d'exercice de restauration) bloque la promotion Vercel + Workers | `release_authorized = false` |

## Chaîne de livraison (C28) appliquée au trio

Jobs GitHub Actions (les `uses:` sont **épinglés à un SHA complet**, cf. `PLAN_GLOBAL_DEPLOIEMENT.md` §5.3) :

1. `lint` + `typecheck` + unitaires (Vitest) — sans secrets.
2. `test-db` : `pnpm --filter @kombe/db test` contre Neon `preview` (branch copie-on-write). Pas de mock PostgreSQL (`STACK.md` §4).
3. `build` : `pnpm -r --if-present run build` — un artefact par package.
4. `scan` : Gitleaks (secrets), Trivy (images + deps), SBOM CycloneDX, provenance.
5. `deploy-preview` : Vercel preview + `wrangler deploy` sandbox.
6. `dast` limité à la cible autorisée, hors données réelles.
7. `promote` : **un même artefact identifié par digest** vers staging puis production ; pas de rebuild.
8. `backup-verify` : job **auto-hébergé** qui restaure le dernier dump dans un projet Neon jetable et exécute `restore_verified` / `revoked_session_accepted=false` / `external_messages_sent=0` ; sinon blocage de la promotion.
9. `post-deploy-smoke` : comptes fictifs dédiés, aucune donnée réelle.

Les jobs candidats **ne reçoivent jamais** les secrets de production (`PLAN_GLOBAL_DEPLOIEMENT.md` §11). Le job `backup-verify` utilise une identité GitHub OIDC limitée au bucket R2 de sauvegarde en lecture seule et au projet Neon « jetable » en écriture.

## Conditionnants avant G0 (hors adoption)

L'ADR est adopté ; les points suivants conditionnent le franchissement de la porte **G0** et restent dus :

1. **Sous-décision `OPEN-D10`** : choisir la région primaire **après** mesure depuis le Cameroun (phase P3). Tant que cette mesure n'existe pas, l'ADR est effectif sur la structure mais **non** sur la localisation.
2. **Ratification des edits CI** : les modifications de workflow (`.github/workflows/*`) touchant au contrôleur H00 et à la politique de promotion restent soumises à revue indépendante (règle « trusted-controller edits need lead ratification before push »).
3. **Premier exercice réel** : les cibles RPO/RTO deviennent contractuelles vis-à-vis de la recette seulement après que le job `backup-verify` a passé `C29-RESTORE`/`C29-RIGHTS`/`C29-OUTBOUND` sur fixtures, réseau sortant coupé. Aucune valeur n'est annoncée avant cet exercice.

## Conséquences immédiates sur le dépôt (si adoption)

- `STACK.md` §2 : lignes `[OPEN-D01]`, `[OPEN-D08]`, `[OPEN-D09]` passent en « **Tranché : voir ADR-0022** » ; `[OPEN-D10]` reçoit un sous-statut « candidat(és) fixé(s), mesure requise avant G0 ».
- `docs/adr/0000_index.md` : nouvelle ligne 0022 dans l'index et mise à jour des notes de slots restants.
- `packages/worker` : ajouter une cible Cloudflare Workers (build `wrangler`, binding Durable Object + Hyperdrive + R2) à côté de la cible Node existante. Aucun changement de sémantique métier — `ADR-0008` et `ADR-0017` restent la référence.
- `packages/api` : conserver Fastify sur Node 22 ; ajouter un test d'adaptateur Vercel Node Runtime pour vérifier `SET LOCAL role` sous pooler direct (`kombe_app`) et le `X-KOMBE-*` header de requête.
- `packages/db` : **aucune modification** — les scripts `migrate.mjs` et `isolation.pg.mjs` restent la référence (cf. mémoire KOMBE migrations).
- CI : ajouter le job `backup-verify` décrit ci-dessus ; les workflows existants `.github/workflows/{ci,dbtest-postgres,h00-trusted}.yml` sont complétés, pas réécrits.
- `05_Deploiement/RUNBOOK_INCIDENT_ET_REPRISE.md` : mettre à jour les procédures pour le trio (runbook Vercel + Workers + Neon + R2) ; l'exercice trimestriel devient la preuve de `18.18`.
- Aucune souscription de service payant n'est effectuée par cet ADR. La décision documentaire ne vaut pas achat.

## Alternatives rejetées (synthèse)

- **Render** en hébergeur unique web + worker — non retenu : le worker outbox exige un verrou par scope (`ADR-0017`) que Render ne fournit pas nativement sans Redis/Durable supplémentaire ; le "backup hors compte applicatif" resterait à ajouter.
- **VPS conteneurisé auto-hébergé** — non retenu : alourdit la chaîne de livraison (C28) sans gain ; contredit l'exigence d'actions CI épinglées + SBOM + artefact unique.
- **Supabase** comme fournisseur composite DB + auth + storage — non retenu tant que `OPEN-D06` n'est pas tranché : ne pas laisser le fournisseur DB dicter la solution d'identité (`ADR-0021` §Hors-périmètre).
- **Un Vercel Cron qui consommerait l'outbox** — non retenu : pas de verrou singleton, pas d'exactly-once par scope ; ce serait régresser `ADR-0017`.
- **Un Worker Node managé par Vercel + `pg_advisory_lock`** — non retenu : la sémantique `pg_advisory_lock` ne couvre pas la reprise après crash du process ; le Durable Object donne la persistance d'état du verrou.
- **Compter sur PITR Neon sans copie indépendante** — non retenu : viole `PLAN_GLOBAL_DEPLOIEMENT.md` §7 et `ZG08`.
