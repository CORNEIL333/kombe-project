# AUDIT DES INCOHÉRENCES — branche déployée `design/immersif-v3`

Date : 2026-10-15. Périmètre : toutes les branches, l'API réelle, la PWA,
l'app mobile, le site et l'environnement de production Vercel (sondes
lecture seule sur https://kombe.vercel.app).

## 0. La branche réellement en ligne

`origin/design/immersif-v3` est la pointe du développement **et** ce qui est
déployé (commit `808b4ba` « mise en ligne réelle sur Vercel » ; `vercel.json`
réécrit `/v1/*` → `/api/serverless`). Elle contient entièrement `master` et
toutes les autres branches (fusions PR #3/#4 de `finalisation-kombe`,
`overnight-release`, `continue-previous`). Seule `claude/project-thread-tr7vq3`
a 13 commits non fusionnés, mais leurs fonctionnalités (cycles successifs,
réserve, console Bureau) sont déjà dans `immersif-v3`, en plus évolué.
Les correctifs de ce rapport sont faits sur `immersif-v3`.

## 1. Reproche par reproche : cause réelle → correctif

### 1.1 « L'app me fait choisir entre cycle fermé / négocier / tirage au sort »
- **Cause** : l'écran mobile `create_group_screen.dart` était une **maquette
  legacy** (dropdowns `tontineModels` / `rotationTypes` de l'ancienne API
  `/v1/groups`), avec un avertissement mensonger « non encore démarrable au
  pilote ». Ces deux choix étaient **silencieusement jetés** par
  `TontineGroupRepository.createGroup`.
- **Réalité produit** : le serveur supporte l'ordre **par saison** au
  démarrage du cycle : `POST /v1/tontines/:id/cycle` et `/cycle-renewals`
  acceptent `order: draw | manual | join_order` (tirage au sort **vérifiable**
  engagement/révélation, ordre décidé par le bureau, ordre d'arrivée —
  `packages/domain/src/tontine/ordering.ts`). La PWA l'expose déjà
  (`td.demarrer`, `api.demarrer`).
- **Correctif** : écran de création mobile réécrit — plus aucun dropdown
  factice ; encadré expliquant que l'ordre se choisit à chaque saison au
  démarrage du cycle.
- **Reste (connu, documenté en C4 de `BLOCAGES_TONTINE_REELLE.md`)** : le
  démarrage de cycle n'existe qu'en PWA ; l'écran mobile « Cycle » est en
  lecture seule.

### 1.2 « L'a mis le montant et la fréquence pour moi »
- **Cause** : `defaultTontineSettings()` côté mobile **imposait**
  10 000 FCFA / hebdomadaire lundi / 12 membres sans rien demander ; la PWA
  **pré-remplissait** le même 10 000.
- **Correctif** :
  - Mobile : le formulaire collecte désormais les **vrais paramètres d'admin**
    (nom, cotisation par part — champ vide obligatoire, rythme avec champs
    dépendants jour/quantième/position/n jours, date de première séance, heure
    limite, max membres 2–60, lieu facultatif) et les envoie tels quels à
    `POST /v1/tontines` (`settingsForDraft`).
  - PWA (`Creation.tsx`) : en création, `contributionPerShare` démarre **vide** ;
    l'étape Cotisation valide `> 0` ; en édition les valeurs serveur restent
    affichées. Les par défaut (10 000) ne servent plus qu'en mode édition/réglages.
- Vérifications : `flutter analyze` sans erreur, `flutter test` 25/25,
  client `typecheck` OK, `vitest` 23/23, `api typecheck` OK.

### 1.3 « Plusieurs cotisations différentes dans une tontine »
- **Réalité produit** : c'est déjà le modèle serveur — un membre prend **1 à 5
  parts** (`shares`, admission et route `/members/:mid/shares`), la cotisation
  est `par part et par séance`. La PWA l'expose (Membres : « parts : n »).
- **Ce qui manquait** : rien dans le domaine ; le formulaire mobile doit le
  dire — c'est fait (aide sous le champ montant). L'UI mobile de gestion des
  parts par membre n'existe pas encore (reporté, voir §3).

### 1.4 « Connexion serveur demandée puis indisponible »
Trois causes distinctes, toutes élucidées :
1. **APK sans `--dart-define=KOMBE_API_BASE_URL`** → mode `unconfigured()` →
   `OperationBlocked(SERVER_AUTHORITY_REQUIRED)` → écran « serveur requis ».
   L'APK **publié** sur kombe.vercel.app est bien buildé avec
   `https://kombe.vercel.app/v1` (scripts `build-apk.ps1`/`.sh`, sonde : le
   fichier APK est servi, HTTP 206). Un APK construit autrement (ou ancien)
   tombe dans ce piège.
2. **Le serveur est en mode réel** (sonde `/v1/health` :
   `{"mode":"rél"}`) mais **des écrans mobiles parlent de routes legacy
   disparues** : les trois dépôts HTTP legacy (`http_group/auth/contribution
   _repository.dart`, orientés vers l'ancienne `/v1/groups` fictive) sont
   **supprimés** du code (ils n'étaient plus branchés ; code mort).
3. **Le message d'échec était illisible** : les écrans affichaient
   `ApiFailure(503, SMS_DELIVERY_FAILED)` au lieu de la raison française du
   serveur. `ApiFailure.toString()` renvoie désormais **le message serveur**
   quand il existe (ex. « Envoi par SMS pas encore ouvert : connectez-vous
   par e-mail ») — correction valable pour les ~15 écrans qui l'affichent,
   plus le motif explicite dans la création de tontine.

### 1.5 « Pas de bon système de sign up / login »
- **Côté code** : login/inscription = **code à 6 chiffres sans mot de passe**
  par canal (email/SMS/WhatsApp), API `/v1/auth/*` réellement câblée dans
  l'app mobile (canaux, demande, vérification, échange Neon, logout).
- **Côté production (le vrai blocage, non résolvable par du code)** :
  sonde `/v1/auth/channels` → `{"sms":false,"whatsapp":false,"email":true,
  "neonAuthUrl":null}` :
  - **SMS fermé** : aucun fournisseur configuré sur Vercel
    (`KOMBE_SMS_PROVIDER`/identifiants Africa's Talking absents) → toute
    connexion par téléphone échoue avec un motif désormais **visible** (§1.4.3).
  - **Email ouvert mais limité** : Resend sans domaine vérifié
    (`KOMBE_EMAIL_FROM` par défaut = `onboarding@resend.dev`) → les codes ne
    parviennent qu'à la propriétaire du compte Resend (bloquage B3).
  - **Neon Auth non branché** : `NEON_AUTH_JWKS_URL`/`NEON_AUTH_BASE_URL`
    absents de Vercel (ADR-0040 prévu, jamais activé).
- Actions restantes = saisies fournisseur (voir §3).

## 2. Problèmes traqués dont nous n'avions pas conscience

1. **Divergence branche de travail** : `master` est en retard de toute la
  ligne produit ; travailler/déployer depuis `master` reproduirait les
  anciennes maquettes. (État vérifié par merge-base ; rien à fusionner dans
  l'autre sens.)
2. **Champs inventés dans les entités mobiles** : `MemberGroup.tontineModel`
  /`rotationType` étaient **fabriqués** (`'personnalise'`/`'rotative_fermee'`)
  à l'affichage de « Mes tontines », donnant l'illusion d'un modèle qui
  n'existe plus. Supprimés (entité, écran, test).
3. **Code mort legacy** : 3 dépôts HTTP + 3 fichiers de tests ciblant
  l'ancienne API fictive — supprimés (ils pouvaient être rebranchés par
  erreur).
4. **Génération locale d'identifiants de groupe** (`grp-<ts>-<rand>` par le
  client) : contraire au contrat « l'ID vient du serveur » ; supprimée.
5. **`reglementParDefaut` PWA pré-remplissait 10 000 FCFA** : même défaut que
  le mobile, corrigé.
6. **Les messages d'erreur serveur étaient masqués sur ~15 écrans** (pattern
  `error.toString()`), pas seulement au login. Corrigé à la source
  (`ApiFailure.toString`).
7. **Site `kombe.vercel.app`** : le multi-pages (téléchargement, aide) est le
  dernier commit d'immersif-v3 ; l'inscription du site renvoie à la PWA, qui
  hérite des limitations email/SMS de §1.5 — ce n'est pas un bug de code.
8. **Le vrai-gap produit mobile** : démarrage de cycle, votes d'ouverture,
  cahier de reprise, tour prioritaire, séance hors-ligne n'existent qu'en PWA
  (déjà inventorié en C4 de `docs/BLOCAGES_TONTINE_REELLE.md`, confirmé).

## 3. Ce qui reste à faire (hors code, saisies fournisseur)

| # | Action | Où | Effet |
|---|--------|----|-------|
| 1 | Créer un compte SMS (Africa's Talking) et set `KOMBE_SMS_PROVIDER=africastalking` + clés | Vercel → Environment Variables | SMS + WhatsApp s'ouvrent, login téléphone fonctionne |
| 2 | Vérifier le domaine d'envoi dans Resend et set `KOMBE_EMAIL_FROM` (ex. `codes@domaine.com`) | Resend + Vercel | les codes email parviennent à **tous** les inscrits (lève B3) |
| 3 | (Optionnel ADR-0040) set `NEON_AUTH_JWKS_URL` + `NEON_AUTH_BASE_URL` | Vercel | canal Neon Auth |
| 4 | Redéployer depuis `immersif-v3` après pull de ces correctifs, puis rebuild APK via `packages/mobile/scripts/build-apk.ps1` | Vercel + dépôt du `/telecharger/` | l'APK publié embarque le nouveau formulaire |
| 5 | Domaine custom (B4) + APK signés (C1) | fournisseur/DNS | confiance des utilisateurs, mises à jour Android |

## 4. Preuves de recette des correctifs

- `flutter analyze` : 0 erreur, 0 warning (105 infos de lint préexistantes).
- `flutter test` : **25/25** (dont suite widgets mise à jour : plus de pastilles
  modèle/typologie ; tests des dépôts supprimés retirés).
- `pnpm --filter @kombe/client run typecheck` : exit 0.
- `pnpm --filter @kombe/client test` (vitest) : **23/23**.
- `pnpm --filter @kombe/api run typecheck` : exit 0.
- E2E PWA existant : l'étape Cotisation saisit explicitement « 5000 »,
  compatible avec le champ désormais vide au départ.

## 5. Session autonome du 2026-10-15 (après-midi) — audit approfondi + correctifs

Audit approfondi mené en parallèle sur les trois surfaces (mobile 115 fichiers,
PWA + site + dashboard bureau, référentiel design 2026). Rapport design :
`docs/DESIGN_2026_REFS.md` (12 règles d'or, ~30 sources vérifiées).

### 5.1 Corrigé dans la session (preuves en §5.3)

| # | Sévérité | Trouvaille | Correctif |
|---|----------|------------|-----------|
| 1 | **P1** | Gap C4 confirmé : aucun écran mobile pour `POST /v1/tontines/:id/cycle` ni `/cycle-renewals` — un groupe créé depuis l'app restait sans tours | Écran Cycle : panneau « Le cycle n'est pas encore lancé » (bureau seulement) avec choix d'ordre **tirage vérifiable** (engagement scellé puis révélé via `POST /draws`) ou **ordre d'arrivée** ; bannière « Saison terminée » quand tous les tours sont servis. L'ordre manuel reste en PWA (seul écran à manipuler la liste des parts) — honnêteté assumée |
| 2 | **P1** | Aucune gestion globale du 401 : session expirée = écrans en échec en boucle | `KombeApiClient.onUnauthorized` → purge `SecureSessionStore` → état déconnecté → redirection connexion (idempotent, ne masque jamais l'échec) |
| 3 | **P2** | PWA Création : cagnotte/durée/simulateur assimilaient maxMembres au nombre de parts (fausses attentes financières dès qu'un membre prend 2-5 parts) | Libellés « hypothèse : une part par membre » explicites (FR/EN) |
| 4 | **P2** | Invitations codées en dur 30 utilisations / 14 jours en PWA **et** dashboard bureau | Utilisations (1-100) et jours (1-30) saisies, champs vides = défauts serveur affichés |
| 5 | **P2** | Dépôt mobile : une tontine créée avait un cycle fantôme (`cycleTotal: 1` dans le fake) | Fake aligné sur le réel : création = cycle non démarré → panneau de lancement |
| 6 | **P2** | Écran Cycle : un cycle simplement non démarré s'affichait « Service indisponible » | État dédié avec explication et prérequis (2 membres actifs, trésorier, statuts acceptés) |
| 7 | **P3** | `devCode` de connexion affiché si le serveur le renvoie, même en production | Double garde-fou : `import.meta.env.DEV` côté UI |
| 8 | **P3** | Échec de copie du lien d'invitation silencieux (PWA) | Message « Copie impossible : utilisez Partager sur WhatsApp » |

### 5.2 Trouvé et DOCUMENTÉ (non corrigé, priorisé pour la suite)

**Mobile** — capacités serveur non exposées : UI parts 1-5 (`/members/:mid/shares`),
contestation d'amende (`/fines/:fid/contest`), votes d'ouverture/clôture
(`/decisions`), réserve (`/reserve-distributions`), échanges de tour
(`/order-changes`), tirage seul (`/draws`), imports cahier de reprise.
Parcours morts à purger ou brancher : litiges (`openDispute` bloqué),
découverte/parrainage (toujours vide), exports. ~225 chaînes FR en dur
(l10n incomplet, PCM absent de `language_screen`). Rejet de paiement avec
motif imposé en dur (repo:611). Majority rule réinventée client
(`requiredYes = n/2+1`, repo:681). FAB contraste 2.5:1 (or/blanc).

**PWA** — amendes non rattachées à la séance (`meetingId` jamais collecté,
`Discipline.tsx:95`) ; décisions de clôture tronquées à 30 sans avertissement
(`Seances.tsx:168`) ; ~80 % des clés i18n `dictionnaires.ts` mortes (résidus
harness, doublonnées par `textes.ts`) ; `src/horsLigne/` + `ImmersiveBackdrop`
jamais rendus (code mort) ; `docs/openapi.yaml` = ancien contrat harness
`/v1/groups` à archiver (le vrai contrat : `docs/API_TONTINE.md`).

**Sécurité** : rien de bloquant — pas de `dangerouslySetInnerHTML`, PV
échappés, localStorage limité au jeton de session, aucun secret en dépôt.

### 5.3 Preuves de recette de la session

- `flutter analyze` : **0 erreur** (110 infos de lint préexistantes).
- `flutter test` : **31/31** (dont 4 nouveaux tests widget du panneau de
  lancement de cycle + 2 tests du hook 401 du client HTTP).
- `pnpm --filter @kombe/client run typecheck` : exit 0 ; vitest **23/23**.
- `pnpm --filter @kombe/dashboard-group-admin run typecheck` : exit 0 ; vitest **3/3**.

## 6. Audit profond SERVEUR — 2026-10-16 (packages/api, packages/domain, packages/db)

Audit demandé (« simulations, travaux bâclés, incohérences, défauts »), mené
en quatre axes parallèles (routes/idempotence, autorisation, cohérence
données/contrats, résilience) puis **re-vérification manuelle de chaque
finding critique dans le code avant correction** — aucun correctif appliqué
sur un rapport non confirmé.

### 6.1 Corrigé (chaque ligne re-vérifiée avant correctif)

| # | Sévérité | Trouvaille (preuve) | Correctif |
|---|----------|---------------------|-----------|
| 1 | **P1** | **Exclusion arbitraire possible** : les routes socle C03/C05 en mode réel ne vérifiaient QUE l'adhésion active — tout membre actif pouvait `POST /membership-terminations` (exclure n'importe qui), changer l'état du groupe, inviter, démarrer cycle/calendrier (`server.ts:1312-1368,1576-1663` ; stores PG sans contrôle de rôle) | Portes L-11 : `resolveGroupActor` collecte toutes les fonctions acceptées (`roles[]`, « founder »→« animator »), nouvelle action `cycle.start` (présidence), `assertCanAct` sur les 10 routes d'écriture socle ; départ de soi toujours permis (`departures`) — 5381c34 |
| 2 | **P1** | **Course d'idempotence** : `write()` enchaînait replay (SELECT) → run() → remember (INSERT) sans verrou — deux requêtes concurrentes portant la même `Idempotency-Key` exécutaient DEUX fois l'effet (`routes.ts:180-193`) | `pg_advisory_lock(route, clé)` sur session dédiée du pool (lock_timeout 5 s, RESET en sortie) autour de replay→run→remember ; ~25 routes d'écriture encore nues (séances, caisses, amendes, secours, dettes, décisions, statuts, tirages, clôtures de tour) passent désormais par `write()`, codes préservés — 225a640 |
| 3 | **P1** | **Course RMW sur les cotisations** : `declare()` lit le « reste à verser » (`computeDues`) puis borne le montant — deux déclarations simultanées passaient toutes deux (`money.ts:334-346`) ; même course sur le solde pendent d'une dette et l'unicité du paiement d'amende | `pg_advisory_xact_lock(groupe)` en tête de transaction (libéré au COMMIT/ROLLBACK ; volume séance = quelques opérations) — 0f640fb |
| 4 | **P1** | **Rate limit à l'IP du proxy** : clé = `request.ip` (socket interne derrière Vercel) → un seul seau partagé par TOUS les clients : 429 collectifs, login 10/min verrouillable par un tiers (`httpGuards.ts:74`) | Clé = `x-real-ip` (posé par la plateforme, non transmis tel quel par le client), socket en repli exécution directe — 7c580ea |
| 5 | **P1** | **Repli fictif possible en production** : sans `KOMBE_API_DATABASE_URL`, `main.ts`/`serverless.ts` démarraient en mode fictif (données inventées derrière des 200 ; le smoke ne rattrape qu'après coup) | Throw au chargement si `VERCEL_ENV`/`NODE_ENV` = production sans base : échec visible, jamais de mensonge silencieux — 7c580ea |
| 6 | **P2** | **IDOR privilège opérateur** : `GET /v1/access/operators/:id/privilege` sans session — sondage du statut opérateur de N'IMPORTE quelle identité (`server.ts:1259-1265`) | Session obligatoire, seule l'identité APPELANTE est consultable (403 sinon) — 5381c34 |
| 7 | **P2** | **Checkpoint scellé depuis le corps** : `issuedBy`/`issuedAt` fournis par le client entraient dans le scellement (attribution falsifiable) (`server.ts:1698-1707`) | Auteur = identité de session, date = horloge serveur ; le corps reste validé en forme — 5381c34 |
| 8 | **P2** | Identifiant mal formé (22P02, ex. UUID invalide dans un chemin) = **500 brut** | Traduit `REQUEST_INVALID` 400 (code nouveau, mappé) — 7c580ea |
| 9 | **P2** | **Montants** : zod acceptait 10 chiffres (> plafond `kombe_money` 1e9 → échec tardif en STATE_CONFLICT générique) ; imports d'historique acceptaient flottants et négatifs (`routes.ts:26,132,135`) | Plafond 1e9 vérifié tôt (zod + `money()` → `MONEY_OVER_PER_AMOUNT_CEILING` 422) ; imports entiers ≥ 0 bornés — 7c580ea |
| 10 | **P2** | Timeouts de transaction 15 s **> kill plateforme ~10 s** : une requête lente finissait en 500 sans réponse plutôt qu'en erreur métier propre (`infra.ts:76-78`) | 9 s (statement + idle_in_transaction) — 7c580ea |
| 11 | **P3** | **Index manquants** : `role_assignment(group_id, membership_id)` (FK jamais indexée, lue à CHAQUE route socle en mode réel), `fund_movement(group_id, membership_id)` (mes cotisations), `fund_movement(declared_at)` (agrégats console 0029) | Migration additive **0032_audit_indexes** (+ down.sql, + runner, + jalon ops) — lot 5 |
| 12 | **P3** | **Garde de copie produit en échec** (I-01/I-08) : « portefeuille » (a-propos) et « chiffrés » (confidentialité) introduits avec les pages site — la suite domain rougissait depuis | Reformulation factuelle (« établissement de paiement », « échanges sous HTTPS ») — ce0bf20 |

### 6.2 Vérifié SAIN (contrôles passés, faux positifs écartés)

- `journal.checkpoint` : le rôle est bien imposé DANS le store (`assertAllowed(role, "journal.checkpoint")`, `pgJournalStore.ts:165`).
- CORS : liste fermée d'origines exactes, credentials renvoyés seulement pour une origine autorisée, jamais « * » (`httpGuards.ts`).
- `requestPenalty` : fonction pure, aucune écriture — pas de porte nécessaire.
- CHECK `role_assignment.role` : bien supprimé en 0026 (les rôles L-11 sont légitimes).
- Matrice PWA `droits.ts` : copie synchronisée du domaine, test dédié vert.
- Détermination réel/fictif décidée UNE fois au cold start (`main.ts:57`, `serverless.ts:18`), aucun repli runtime — l'architecture était saine, seul le cas « prod sans base » manquait de garde (corrigé, #5).

### 6.3 Documenté, NON corrigé (P2/P3 — à planifier, aucun masque appliqué)

- **RLS** : ~7 tables sensibles sans RLS (`restore_point`, `data_erasure_tombstone`, `personal_consent`, `processing_record`, `legal_notice`, `pilot_risk`, `command`) — SELECT multi-groupes ouvert à `kombe_app` ; passe SECURITY DEFINER à prévoir (travail de fond, migration dédiée).
- `confirm()`/`control()` : double confirmation concurrente d'un même mouvement non verrouillée (effet limité : re-UPDATE du même état) — à aligner sur le modèle `declare()` lors d'une prochaine passe.
- Deux séances « ouvertes » simultanées restent possibles (pas d'index unique partiel) ; témoins d'une autre séance non filtrés à l'affichage.
- Notifications hors-ligne non rejouées à la reconnexion ; `newcomersLast` (reprise d'historique) non borné.
- Jetons de session (`ses_*`) stockés en clair côté base (at-rest).
- `docs/openapi.yaml` : ancien contrat harness, divergent du réel (201 sur `code-verifications`/`draws`, `notifications/read` renvoie `{updated}`, 410 sur invitations épuisées) — à archiver au profit de `docs/API_TONTINE.md`.
- Mobile (inchangé depuis §5.2) : ~225 chaînes FR en dur, motif de rejet imposé en dur, majorité réinventée côté client.

### 6.4 Preuves

- `pnpm --filter @kombe/domain run typecheck` + build : exit 0.
- `pnpm --filter @kombe/api run typecheck` : exit 0.
- vitest : domain **428/428** (dont copie produit réparée), api **245/245**, client **23/23** (matrice PWA synchronisée).
- Migration 0032 : déclarée dans `migrate.mjs`, jalon ops mis à jour, `down.sql` fourni, `opsMigration.test` vert.
- Commits : 7c580ea (lot 1), 225a640 (lot 2), 0f640fb (lot 3), 5381c34 (lot 4), ce0bf20 (copie site), lot 5 = migration 0032 + le présent document.

## 7. Session du 2026-10-16 (soir) — audit API ↔ communication des quatre clients

Audit de la couche `/v1` et de son dialogue avec les quatre surfaces : app mobile
Flutter, PWA membres, espace bureau (dashboard-group-admin) et les trois
tableaux de bord ops / direction / engineering. Inventaire exhaustif des appels
par client, puis vérification manuelle de chaque finding (trust but verify).

### 7.1 Corrigé

| # | Sévérité | Trouvaille | Correctif |
|---|----------|------------|-----------|
| 1 | **P2** | **Gating incohérent des métriques plateforme** : `GET /v1/metrics/analytics/funnel/:cohortId`, `POST /v1/metrics/cohorts` et `GET /v1/metrics/cohorts/:groupId` n'exigeaient qu'une session (`gateAuth`), alors que `economics`/`risks`/`extension-check` exigent l'opérateur (`assertRealOperator`). Un membre authentifié pouvait lire l'entonnoir de son groupe et réécrire `pilot_cohort` (member_count / rounds_completed) de son propre groupe — la RLS borne au groupe mais n'empêche pas la falsification | Portes `assertRealOperator` posées sur les trois routes (`server.ts:2795/2812/2825`) ; `POST /v1/metrics/analytics/events` reste session-only PAR DESIGN (télémétrie utilisateur authentifiée, jamais consultée) ; preuve réelle `pgMetricsStore.proof.mjs` réorganisée — M-OPERATOR-ONLY : 4×403 (funnel, cohorts, economics, risks) avec la session membre AVANT le grant, lectures opératrices ensuite |
| 2 | **P3** | **Configs dev committées pointant le domaine périmé** `https://kombe-api.vercel.app` (ancienne architecture deux-projets, supersedée 2026-10-09) : tout `vite dev` local envoyait PWA et tableaux de bord vers une vieille API publique | Les 5 `public/kombe-dashboard-config.json` → `http://127.0.0.1:3000` (`environment:"local"`), alignés sur l'exemple engineering. La prod n'a JAMAIS été touchée : `scripts/build-web.mjs:56` supprime ces copies et `:62-66` écrit la config racine `apiBaseUrl:"/"` (chaîne vérifiée : `vercel.json` → `scripts/vercel-build.mjs` → `build-web.mjs`) |
| 3 | **P3** | `OperationsApi` : deux méthodes mortes `perform()` et `getAccess()` (aucun usage dans `apps/dashboard-operations/src`) | Supprimées |
| 4 | **P3** | **Mobile : motif de rejet de cotisation imposé en dur** (`tontine_repositories.dart:643`) — le trésorier ne pouvait pas expliquer son rejet alors que le serveur accepte un motif libre de 3 à 500 caractères (`tontine/routes.ts:35`) | Paramètre `reason` sur `decideValidation` (interface + implémentation réelle + indisponible + fake de test) ; champ « Motif du rejet » (500 car.) affiché dans l'écran de validation quand « Rejeter » est choisi, prérempli avec l'ancien motif par défaut |

### 7.2 Vérifié SAIN (contrôles passés, faux positifs écartés)

- **Config de production** : `apiBaseUrl:"/"` même origine, écrite à chaque build (`build-web.mjs`), priorité sur le fallback `VITE_KOMBE_API_BASE_URL` (`dashboard-core/runtime.ts`) ; smoke 2026-10-15 cohérent.
- `packages/client/dist/kombe-dashboard-config.json` (localhost:5177) : artifact de build local NON committé (`git ls-files` : aucun `dist/`).
- **Socle legacy `/v1/groups/*` : appelé par AUCUN client** (mobile, PWA, bureau, ops, direction, engineering) — les portes L-11 du §6 ne cassent aucun consommateur.
- **Saisie des montants PWA** : champ borné à 10 chiffres = jusqu'au plafond serveur 1 000 000 000 XAF inclus ; au-delà, refus propre 400 `REQUEST_INVALID` / `MONEY_OVER_PER_AMOUNT_CEILING` (correctifs §6).
- **Chaîne d'idempotence et de timeouts** : écritures mobile via `postOnce` (Idempotency-Key) → verrou advisory serveur (§6 lot 2) ; timeouts clients (mobile 15 s, PWA/tableaux 15-20 s) > timeouts SQL 9 s > kill plateforme : aucun chevauchement ambigu.
- **Charge** : PWA ≈ 1 req/min au repos (poll 60 s + navigation), mobile sans poll, tableaux sans poll — très en dessous du quota 120/min/IP.
- **CORS** : liste fermée + same-origin en prod (projet Vercel unique) → zéro requête cross-origin réelle.

### 7.3 Documenté, NON corrigé (P3 — à planifier)

- **Resoumission d'un brouillon de cotisation mobile = NOUVELLE Idempotency-Key à chaque essai** (`kombe_api_client.dart:88`) : un échec réseau ambigu (réponse perdue) suivi d'une resoumission peut créer un doublon de mouvement. Le correctif juste (clé générée à la création du brouillon et persistée jusqu'au succès, ou identité métier période+membre+montant) est une décision de design — à trancher avant implémentation.
- 3 écritures mobile sans Idempotency-Key : logout, `PATCH /me`, `notifications/read` (non créatrices de ressources, doublon inoffensif).
- Mobile : re-fetch des listes complètes après chaque écriture (N+1, acceptable à l'échelle d'un groupe < 300 membres).
- Mobile : pas d'épinglage de certificat (TLS système) — à réévaluer si le modèle de menace évolue.
- Passerelle engineering locale sans authentification mais liée à 127.0.0.1 uniquement, jamais exposée au build web.
- Dettes §5.2/§6.3 inchangées (RLS, `openapi.yaml`, i18n mobile, etc.).

### 7.4 Preuves

- `pnpm --filter @kombe/api run typecheck` : exit 0 ; vitest api **245/245** (23 fichiers).
- `pnpm --filter dashboard-operations run typecheck` : exit 0.
- `flutter analyze` : 0 erreur (109 infos de lint préexistantes) ; `flutter test` : **31/31** (fake aligné sur la nouvelle signature).
- Preuve réelle `pgMetricsStore.proof.mjs` mise à jour (M-OPERATOR-ONLY étendu + en-tête) : à relancer sur la branche PREVIEW Neon au prochain passage — la lecture du `.env` est bloquée à cette session (garde-fou secrets), l'action porteur reste dans DEPLOY.md.
- vitest client et dashboard-direction non relancés : aucun fichier TS/TSX modifié côté PWA/direction (configs JSON et `apps/dashboard-operations` seulement).
