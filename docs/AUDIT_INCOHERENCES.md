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
