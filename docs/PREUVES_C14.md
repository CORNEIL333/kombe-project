# Preuves & revue — Lot C14 (interface : parcours guidé, accessibilité, bilingue FR/EN) · KÓMBE

- **Commit C14 (code) :** `dab93e567f7fd00baee00adb8c612df7864f7492`
- **Porte :** G0 · **Dépendances :** C02 (identité/accès/sessions), C03 (cycle de vie du groupe), C04 (règles versionnées), C05 (calendrier cycles/tours/bénéficiaires) · **Stories :** 12.1 (parcours guidé **4 étapes** avec retour sans perte et récapitulatif avant validation définitive), 12.4 (accessibilité — navigation clavier, libellés, erreurs liées aux champs, **aucune information par couleur seule**, états chargement/vide/erreur/permission/hors-ligne), 12.6 (bilingue **FR complet + architecture i18n EN** avec bascule accessible à tout moment) ; 12.3 (skeleton/états de chargement) et 12.5 (performance p95/LCP/INP sur téléphones réels) restent **partiellement couvertes/BLOCKED** (§6/§8) — consignées, non simulées.
- **Auteur / cycle :** Qoder — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-10-02
- **Environnement :** Node **v26.4.0**, pnpm 11, **Vite 8.3.2**, React 19, TypeScript strict, **Playwright 1.63.0 / Chromium révis. 1243 (présent localement)**. **Docker / PostgreSQL / remote CI : absents.**
- **Statut plateau :** `in_review` (une relecture par un harnais **distinct** du lead signe le `done` ; jamais auto-validé — règle H06).
- **Déverrouillage C00 :** ce lot est le **premier à raccorder ET exécuter réellement** un build Vite et une recette E2E Playwright. La condition C00 « pas de dépendance UI avant build + Playwright raccordés » est donc **levée par l'exécution** (build `dist/` réel + 3 tests navigateur verts), non par une déclaration.

## 1. Inspect (état de départ)
- Le paquet `@kombe/client` était **vide** (un seul `package.json`). Aucun build, aucun test, aucune UI. Le contrat C00 interdisait toute dépendance UI tant que Vite + Playwright n'étaient pas **réellement** câblés et exécutés.
- Vérification d'exécutabilité avant de s'engager : egress npm OK (Vite 8.3.2 résolu), Node ≥ 22 (v26.4.0), **navigateurs `ms-playwright` présents** (`chromium-1243` + `chromium_headless_shell-1243`) et **révision attendue par `@playwright/test` 1.63.0 = 1243** (contrôlée dans `browsers.json`) → l'E2E est **réellement exécutable ici**, pas une scaffold BLOCKED.
- Périmètre construit **exécuté localement** : un **parcours guidé 12.1** en quatre étapes (`Modèle → Njangi → Caisse → Récapitulatif`) où **revenir en arrière conserve les données** déjà saisies et où **la confirmation finale du récapitulatif est l'unique action de soumission** ; une **architecture i18n réelle** (toute chaîne affichée passe par `t(cle)`, dictionnaires FR + EN typés **complètes**, bascule **aria-pressed** qui retraduit toute l'UI et met à jour `<html lang>`) ; des **primitives accessibles** (`<label htmlFor>`+`id`, aide + erreur liées par `aria-describedby`, `aria-invalid`, erreur en `role="alert"`, indicateur d'étape par **texte** + `aria-current="step"`, zones d'état `status`/`alert`) ; et une **règle d'affichage argent** (C14-MONEY) : une contribution **déclarée « en cours »** n'est **jamais** présentée comme payée/vérifiée.
- Réutilisation **encadrée** du socle : aucune réimplémentation de domaine — le client **n'appelle pas** l'API dans cette tranche. La frontière de soumission est un **callback injecté** (`onSoumettre`) volontairement non raccordé à un `POST` réseau : le **mécanisme** UI (ne soumettre qu'à la confirmation) est prouvé ; la **soudure** vers C02/C03/C05 (création réelle d'un groupe, règlement externe du pot, XAF entier côté serveur) reste à câbler (§8). Les montants restent **entiers** (regex `^\d+$`, `BigInt` pour la validation, **aucun flottant**, ADR-0002).
- **Hors du périmètre réellement exécuté maintenant (consigné, non simulé) :** la recette E2E **multi-acteurs contre l'API réelle + base** (nécessite un backend servi), la **mesure** p95 serveur / LCP / INP sur téléphones réels du pilote et réseau dégradé (12.5), la **certification** WCAG AA (12.4 — ici primitives + audit manuel, jamais une certification implicite), le **cache PWA** maîtrisé et les skeleton screens mesurés (12.3), et le **recrutement anglophone** conditionnant la complétude éditoriale EN (12.6).
- Fichiers impactés : uniquement `packages/client/**` (nouveaux) + `.gitignore` (ignore des artefacts Playwright/vitest par paquet) + `pnpm-lock.yaml` (toolchain client). **Aucune** touche à `domain`/`api`/`db`/`worker`.

## 2. Contractualiser
- **Contrat de parcours (12.1) :** `ParcoursGuide` garde l'état `{ etape, donnees{nomGroupe,modele,montant,membres}, touche }`. Navigation avant/arrière **sans appel réseau ni `onSoumettre`**. Validation par étape (`erreursEtape`) : `nomGroupe` non vide (étape 0) ; `montant` entier strict `> 0` via `montantValide` (`^\d+$` + `BigInt>0`) ; `membres` entier `∈ [3,1000]` via `membresValides`. Les **messages d'erreur ne s'affichent qu'après une tentative** (`touche`) — pas d'alerte agressive avant interaction. `confirmer()` **réévalue toutes les étapes** avant d'appeler `onSoumettre` (garde-fou anti-soumission partielle) ; `onSoumettre` est appelée **exactement une fois**, uniquement depuis le récapitulatif.
- **Contrat d'accessibilité (12.4) :** chaque `ChampTexte`/`ChampSelect` lie `<label>`↔contrôle (`htmlFor`/`id` issus de `useId`, uniques), publie aide + erreur via `aria-describedby` (ids `${base}-aide`/`${base}-erreur`) et `aria-invalid` en erreur ; l'erreur porte un **texte explicite** « Erreur : … » en `role="alert"` (jamais la couleur seule). `IndicateurEtapes` exprime la position en **texte** (« Étape N sur M » en `role="status"`, `aria-current="step"` + « en cours »/« terminée »). `ZoneEtat` couvre chargement/vide/erreur/permission/hors-ligne avec le rôle sémantique adéquat. Lien d'évitement **visible au focus**. Bascule de langue = `role="group"` + boutons `aria-pressed`. Boutons `type="button"` (jamais `submit` implicite). CSS : paires de contraste ≥ 4,5:1 pour le texte courant, cible tactile ≥ 44 px, `prefers-reduced-motion` respecté.
- **Contrat i18n (12.6) :** `CleI18n = keyof typeof fr` ; `en` est typé `Record<CleI18n,string>` → **la compilation échoue** si une clé FR manque en EN (aucune chaîne orpheline). `t(cle, vars)` lit le dictionnaire de la langue active avec repli FR ; interpolation `{nom}`. Changer la langue re-rend toute l'UI et synchronise `document.documentElement.lang`.
- **Contrat « argent » affiché (C14-MONEY) :** `StatutContribution ∈ {en_cours, valide, conteste}` ; l'oracle `revendiquePaiementVerifie(statut)` ne renvoie `true` **que** pour `valide`. `BadgeStatut` affiche le **texte** du statut ; « en cours » ⇒ « Déclaré — en cours de validation » (**ne prétend pas** paiement vérifié/reçu).
- **Pas de migration :** C14 est **exclusivement client** ; aucune table, aucun schéma DB, aucune route API ajoutés. Les preuves de persistance/isolation (append-only, RLS) ne s'appliquent pas à ce lot.

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm -r build       # @kombe/domain, @kombe/api, @kombe/worker, @kombe/client (vite build → dist/)  → exit 0
pnpm -r test        # vitest run (domaine + api + contrat + worker + client jsdom)                    → exit 0
pnpm --filter @kombe/client exec tsc -p tsconfig.json --noEmit   # strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess → exit 0
node node_modules/vite/bin/vite.js build                         # dist/index.html + assets (22 modules)                                → exit 0
node node_modules/@playwright/test/cli.js test                   # 3 E2E Chromium (vite preview :4173 sert dist/)                        → exit 0
python harness/run_h00.py --commit dab93e5… --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2 (BLOCKED, jamais un PASS simulé)
```
Résultats réels :
- `@kombe/domain` → **337 passed** · `@kombe/api` → **198 passed** · `@kombe/worker` → 10 tests, 0 fail (aucune régression)
- `@kombe/client` (vitest/jsdom) → **10 passed** (`src/test/parcours.test.tsx`)
- `@kombe/client` **E2E navigateur (Playwright/Chromium 1243)** → **3 passed** (`e2e/parcours.spec.ts`) — **exécutés réellement**, serveur `vite preview` inclus

### Hashes SHA-256 des artefacts C14 (au commit `dab93e5`)
| sha256 | Fichier |
|---|---|
| `9bdbcc7df46fe6c4aae509cd48c14df508ef83a62f270cc3b153f80f4f464d8c` | `packages/client/index.html` |
| `95b79bc7236e02b63a35b32d10db52146311bee3c55d0997ac077da421609e44` | `packages/client/package.json` |
| `537f2b965728db7e030e5b0a5359f666eabd1c8989b80f92ce9cf34005fe9aeb` | `packages/client/tsconfig.json` |
| `c428314ced79a4427f9b7ccdb1682fe8486de979ba3c16300d8d21d146caf3e0` | `packages/client/vite.config.ts` |
| `c514575b25666d5681c8c4f5e85b76bc72a1770e8929725875e159284e50db32` | `packages/client/playwright.config.ts` |
| `822f8e25ca19dbf36d78b7ff04af37e5a437c8b548a4f4c1edcd4ee758e6e0b7` | `packages/client/src/main.tsx` |
| `b69280c287383463a74f9429bd55e73a51a7801e7b5a42d3a71f7850426f3d16` | `packages/client/src/App.tsx` |
| `fa31ca75e4dea27430aaa31395c8a4262baf3ca43d392e96a7582df2674fe3f8` | `packages/client/src/styles.css` |
| `a8114daa9d6ccd162d9fada6e4097f0474bca9622bda7fe61adee264189b40dc` | `packages/client/src/i18n/dictionnaires.ts` |
| `9c52b6ed6e711ceded0c5b387ed84913ffbdae899a4dd499ed942690655ac4de` | `packages/client/src/i18n/ContexteLangue.tsx` |
| `ed0b1b105bf8c206f0f3f9d0560b72b5a4db1c25eef44d9a2410008a60a9a9f3` | `packages/client/src/composants/Champs.tsx` |
| `b353ac4d2856656531748c780c84b6e1a23fdf2cd88b3446c9b83a6d4d05e463` | `packages/client/src/composants/Etats.tsx` |
| `f86dd9f5fe74d36c8c2f5307158eabfa17a7c0a6c90b92a608a602e702b3f927` | `packages/client/src/composants/StatutContribution.tsx` |
| `427a485faef5a8cd6907f3c7ae79e42468309ebe7f8c065be0310adcd9760061` | `packages/client/src/parcours/ParcoursGuide.tsx` |
| `31dcd279083478dc121dbe4b9c373391226441454a0c834cbc9c432bd6526593` | `packages/client/src/test/setup.ts` |
| `75105e8227db344f91b268963ac7d229f0325443c0ef68c1314f5ecc36cd2211` | `packages/client/src/test/parcours.test.tsx` |
| `65634c0e2e09ba5c05b76977e1d18d0a950d420a3232f72a5a177b0407339a0e` | `packages/client/e2e/parcours.spec.ts` |
| `7d69e6fd067f5adf9366f49ec228201af7f9375b8c1ddf2a0dac85f57c23c505` | `harness/reports/RAPPORT_G_CONSTRUCTION.json` |

## 4. Éprouver (scénarios propres à C14, via DOM jsdom + navigateur Chromium)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| **C14-BACK** | aller (Suivant) puis **revenir (Précédent)** pendant la saisie ⇒ `onSoumettre` **jamais** appelée (`submission_count = 0`) **et** la donnée (`nomGroupe`) **conservée** | ✅ (unitaire + E2E) |
| C14-BACK (garde) | `Suivant` avec champ requis vide ⇒ on **reste** sur l'étape + **`role=alert`** présent ⇒ aucune soumission | ✅ |
| **C14-MONEY** | oracle `revendiquePaiementVerifie` : `en_cours`⇒**false**, `conteste`⇒**false**, `valide`⇒true | ✅ |
| C14-MONEY (texte) | badge « en cours » = **« Déclaré — en cours de validation »**, sans mot « vérifié/payé/reçu » ; l'étape **Caisse** présente la contribution **en cours**, non validée | ✅ |
| Soumission finale | `onSoumettre` appelée **exactement une fois**, à la **confirmation du récapitulatif**, avec les `{nomGroupe,modele,montant,membres}` saisis | ✅ |
| **C14-A11Y** | chaque champ a un **nom accessible** (`getByLabelText`) ; l'erreur est **liée** (`aria-describedby` ∋ id de l'`role=alert`) et `aria-invalid=true` ; l'étape courante est marquée en **texte** (`aria-current=step` + « en cours »), **pas par couleur seule** | ✅ (unitaire) |
| C14-A11Y (clavier) | premier `Tab` ⇒ focus sur le **lien d'évitement** (`toBeFocused`) | ✅ (E2E navigateur) |
| 12.1 parcours | les **quatre étapes** enchaînées jusqu'au récapitulatif, le récap affiche les données, **retour** ramène à la caisse avec données intactes | ✅ (E2E navigateur) |
| **12.6 i18n** | bascule FR/EN (`aria-pressed`) ; cliquer « English » **retraduit toute l'UI** (titre → « Create my group ») et met `<html lang>` à `en` | ✅ (unitaire + E2E) |

Chaque observation provient **d'actions réelles** sur le DOM rendu (jsdom) et, pour trois scénarios, d'un **vrai navigateur** (Chromium piloté par Playwright, serveur `vite preview` servant le bundle `dist/`). Aucune assertion ne recopie une constante d'un fichier d'attentes. Les chemins négatifs vérifient l'**absence d'effet** (aucune soumission pendant la navigation) et la **non-revendication** (un « en cours » n'affirme jamais un paiement).

## 5. Revue CodeReview — à réaliser par un harnais DISTINCT (règle H06)
Ce lot est `in_review`. **qoder** l'a produit ; il **ne peut pas** signer son propre `done`. La relecture (diff, primitives a11y, gating des erreurs, absence de soumission au retour, complétude i18n, non-promesse « argent ») doit être exécutée et signée par un harnais distinct (`claude-code` ou lead `CORNEIL333`). Points d'attention soumis au relecteur :
- **Gating des erreurs par `touche` :** les messages n'apparaissent qu'après une tentative d'avancer ; confirmer que ce compromis (pas d'alerte initiale) satisfait 12.4 plutôt qu'un signalement « field-level dès le blur » attendu par certains auditeurs. Le focus ne se déplace **pas** vers l'erreur — à juger suffisant ou à renforcer (`aria-live`/focus gestion).
- **`submission_count = 0` comme observable :** en **l'absence de backend raccordé**, l'observable est le **non-appel** de `onSoumettre` (callback frontière). À valider : lors de la soudure API (§8), cet observable devra se mesurer côté serveur (aucune écriture de création de groupe pendant la navigation), pas seulement côté client.
- **Frontière « argent » :** `montantValide` impose entier strict > 0 mais **ne pose aucun plafond** ; le **vrai** contrôle des montants (plafonds ADR-0002, XAF entier canonique) **demeure serveur**. Vérifier que le client n'est présenté nulle part comme garant de la validité monétaire (il ne fait qu'une validation de forme).
- **Portée WCAG :** les primitives visent AA (contrastes codés en tokens, texte non-couleur, clavier), mais **aucune certification** n'est affirmée. Confirmer que la formulation reste « objectif AA, périmètre documenté, audit manuel » et non une conformité déclarée.
- **i18n :** la complétude EN est **structurelle** (type `Record<CleI18n,string>`), pas **éditoriale** — valider que les libellés EN sont acceptables pour une maquette et que le vocabulaire local (Njangi, caisse) reste inchangé dans les deux langues (lien 3.8).

## 6. Limites — ce qui reste **BLOCKED / non activé** (jamais simulé)
| Scénario | Observation visée | Statut |
|---|---|---|
| E2E **multi-acteurs contre API + base** (C02/C03/C05 réels) | création de groupe réellement persistée, règlement externe du pot | **non activé — substrat UI posé** |
| Soudure `onSoumettre` → `POST` de création | soumission réelle, idempotence, version (ADR-0006/0017) | **non câblée** (callback frontière) |
| 12.5 **performance** | p95 serveur < 700 ms, LCP/INP sur **téléphones réels** + réseau dégradé | **BLOCKED** (matériel/CI absents ; aucune mesure annoncée faute de benchmark) |
| 12.4 **certification WCAG AA** | conformité attestée par audit externe | **non certifié** — primitives + audit manuel, objectif documenté |
| 12.3 **skeleton/PWA** | cache PWA maîtrisé, LCP mesuré en continu | **partiel** — états chargement présents ; mesure/skeleton outillés **à venir** |
| H03/H06/H07/H09/H10/H13/H14/H18/H20 | isolation contrôleur, identité authentifiée, base réelle, sandbox, chaîne de livraison | **BLOCKED** (limites d'environnement ADR-0010 ; cf. H00 §7) |

## 7. Rapport H00 au SHA C14
```
python harness/run_h00.py --commit dab93e567f7fd00baee00adb8c612df7864f7492 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED / 0 NOT_RUN**. La chaîne de contrôle d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08 mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010). **C14 n'a pas** modifié le contrôleur, les attentes ni la politique de livraison pour obtenir un statut. **Nuance propre à C14 :** contrairement aux preuves « base réelle » d'autres lots, **le build et l'E2E de ce lot sont réellement exécutés** (exit 0) — le blocage H00 porte sur l'isolation/la base/la CI, pas sur l'existence d'un pipeline UI, dont C14 fournit la **preuve d'existence**.

## 8. Défauts / dépendances restants (limites assumées, consignées — non masquées)
- **Prochaine dépendance fonctionnelle :** raccorder `ParcoursGuide.onSoumettre` à un `POST` réel de **création de groupe** (C03) via l'API (C02 auth/sessions, C04 acceptation des règles, C05 calendrier), puis étendre la recette E2E à ce **circuit multi-acteurs servi** — l'observable `submission_count` devra alors être mesuré **côté serveur**.
- **Raccord monétaire (C05/ADR-0002) :** le client ne fait qu'une validation **de forme** (entier > 0) ; les **plafonds** et la canonisation XAF entière restent **serveur** ; l'étape « caisse » doit consommer l'état réel des **validations** (déclaré ≠ validé) dès que l'API d'obligations est branchée.
- **Performance (12.5) & A11Y (12.4) :** benchmark p95/LCP/INP sur terminaux du pilote + audit WCAG formel **à programmer** quand matériel/CI disponibles ; ne publier **aucun** chiffre avant mesure.
- **PWA (12.3) :** manifest + service worker (cache, reprise hors-ligne réelle) et skeleton screens outillés restent à livrer ; l'état « hors-ligne » est **représenté** (UI) mais la **reprise** réelle de synchronisation n'est pas encore câblée.
- **CI / Conteneur (C28)** pour H03/H06/H09/H10/H13/H14/H20 ; intégration de `pnpm --filter @kombe/client test:e2e` dans le pipeline dès qu'un exécuteur avec navigateurs est disponible (le `webServer` Playwright est déjà réel).
