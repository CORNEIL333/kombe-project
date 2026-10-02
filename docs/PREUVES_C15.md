# Preuves & revue — Lot C15 (cache hors-ligne + synchronisation) · KÓMBE

- **Commit C15 (code) :** `336d7ed60448dceb2e3309cf55131e6b16c68721`
- **Porte :** G0 · **Dépendances :** C06 (calendrier/état serveur — `done`), C14 (interface — `in_review`, code commité `dab93e5`, build + Playwright réellement exécutés, tests verts ; traité comme socle stable, même règle divulguée que C08→C12 et C12→C16) · **Stories :** 12.2 (mode faible connectivité — cache de lecture avec date de synchro, **brouillons distincts des commandes acceptées**, validation/vote/rôle/règles exigent le serveur, révocation contrôlée à la reconnexion, durée de cache bornée, mode appareil partagé), 18.7 (reprise hors connexion — dernière synchro visible, brouillon non assimilé à une déclaration, droits et règles re-contrôlés au retour réseau, purge à la déconnexion, cas appareil partagé testé).
- **Auteur / cycle :** Qoder — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-10-02
- **Environnement :** Node **v26.4.0**, pnpm 11, **Vite 8.3.2**, React 19, TypeScript strict, **Playwright 1.63.0 / Chromium révis. 1243 (présent localement)**, **vitest 5 (jsdom)**. **Docker / PostgreSQL / remote CI : absents.**
- **Statut plateau :** `in_review` (une relecture par un harnais **distinct** du lead signe le `done` ; jamais auto-validé — règle H06).
- **Nature de la preuve :** C15 est un incrément **client pur, sans backend**. Le **mécanisme** hors-ligne (brouillon ≠ accepté, scopage/purge par identité, re-contrôle d'autorité au retour, TTL jugé par le serveur, idempotence par clé persistée) est **réellement exécuté** en tests (jsdom) et en navigateur (E2E offline). La **frontière serveur** (`Transport`) et le **dépôt** (`Depot`) sont **injectés et stubbés** : les scénarios C15-OFFLINE/LOGOUT/RECONNECT prouvent le **contrat côté client**, **pas** la garantie de bout en bout (la véritable autorité/idempotence/RLS serveur relèvent de C02/C03/C05 — §6/§8).

## 1. Inspect (état de départ)
- C14 a livré le client (build + E2E réels). **Rien** de la couche hors-ligne n'existait : ni cache, ni file de commandes, ni reprise réseau, ni scopage par identité.
- Périmètre construit **exécuté localement** : un **moteur hors-ligne** (`src/horsLigne/moteur.ts`) sans dépendance à un serveur ; un **dépôt en mémoire** (`depots.ts`) implémentation locale du contrat `Depot` ( IndexedDB/service worker en production) ; un **bandeau d'état accessible** (`BandeauHorsLigne.tsx`) piloté par la connectivité **réelle** du navigateur ; des **clés i18n FR/EN** additionnelles.
- Réutilisation **encadrée** : le client **n'appelle pas** l'API ; le serveur est un `Transport` **injecté**. Aucun mock de PostgreSQL (néant — verrouillage/isolation ne s'exercent pas ici) ; la validation **d'autorité** est **déléguée** à l'objet `Transport` qui re-tranche au moment de l'envoi, jamais à une constante lue dans un fichier d'attentes.
- **Hors du périmètre réellement exécuté (consigné, non simulé) :** le service worker et son cycle de mise à jour, la persistance réelle (IndexedDB), la soudure vers l'API (C02 auth, C03 groupe/validations, C05 calendrier) qui détiendrait la **vraie** autorité et la **vraie** déduplication d'idempotence, et les requêtes privées « non mises en cache » côté PWA. §6 détaille.
- Fichiers impactés : uniquement `packages/client/src/horsLigne/**` (nouveaux), `packages/client/src/{App.tsx,styles.css,i18n/dictionnaires.ts}` (intégration), `packages/client/src/test/horsLigne.test.tsx` + `packages/client/e2e/horsLigne.spec.ts` (nouveaux). **Aucune** touche à `domain`/`api`/`db`/`worker`. **Pas de migration** (client pur).

## 2. Contractualiser
- **Brouillon ≠ commande acceptée (C15-OFFLINE) :** `StatutCommande ∈ {brouillon, en_attente, acceptee, refusee, conflit}` ; **seul** `acceptee` est « validé serveur » via l'oracle `statutServeurValide`. `soumettre()` **hors-ligne** passe en `en_attente` et retourne `serverValide = false` — jamais `acceptee`. Un `brouillon` créé hors-ligne ne peut devenir « accepté » que par un **acquittement** du `Transport`.
- **Cache scopé, borné, assaini :** écriture par portée `{identiteId, groupId}` ; **TTL** né avec la date de synchro **serveur** ; `assainirPourCache` retire **structurellement** tout champ sensible (`token`, `secret`, `authorization`, `motdepasse`, `commentaire`, `reference`, `iban`, `litige`) ⇒ aucun secret d'auth, commentaire de litige ni référence complète en cache par défaut. **Expiration jugée par l'horodatage SERVEUR** passé à `lireCache` ; l'horloge **client** n'intervient que pour l'affichage (`creeLe`) et **ne prolonge jamais** un droit. Entrée périmée = **éviction** (suppression).
- **Purge par identité (C15-LOGOUT) :** toutes les données sont sous des clés `{q|c|s}:identiteId::groupId` ; `deconnecter(identiteId)` appelle `Depot.supprimerPortee`, qui retire **toute** la portée de cette identité. Un autre compte (B) lit sous ses propres clés ⇒ `a_data_visible_to_b = false`. **Mode appareil partagé** (`modePartage`) : `ecrireFile`/`ecrireCache`/`marquerSync` sont des **no-op** ⇒ **aucune conservation** dès le départ.
- **Reprise + revalidation (C15-RECONNECT) :** `synchroniser(portee)` re-soumet chaque `en_attente`/`brouillon` **avec la MÊME clé d'idempotence** (`id` stable) ; la décision **revient au serveur** : `accepte`⇒`acceptee` (+ horodatage de synchro), `AUTORITE_REVOQUEE`⇒`refusee` (`mutation_accepted = false`), `CONFLIT_VERSION` (409)⇒`conflit` (**rechargement + confirmation humaine**, jamais d'écrasement silencieux). Échec réseau transitoire ⇒ la commande **reste** `en_attente` (clé non consommée).
- **Argent :** `montant` reste une **chaîne XAF entière** ; `creerBrouillon` rejette tout non-entier (`^\d+$`) — validation **de forme** seulement, les plafonds/règles restent **serveur** (ADR-0002).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm -r build       # domain/api/worker + client (vite build → dist/, 23 modules)  → exit 0
pnpm -r test        # vitest (domaine + api + contrat + worker + client jsdom)       → exit 0
node node_modules/typescript/bin/tsc --noEmit                       # strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess → exit 0
node node_modules/vite/bin/vite.js build                            # dist/ réellement émis                                          → exit 0
node node_modules/@playwright/test/cli.js test                       # 4 E2E Chromium (dont 1 offline via setOffline)                → exit 0
python harness/run_h00.py --commit 336d7ed… --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2 (BLOCKED, jamais un PASS simulé)
```
Résultats réels :
- `@kombe/domain` → **337 passed** · `@kombe/api` → **198 passed** · `@kombe/worker` → 10 tests, 0 fail (aucune régression)
- `@kombe/client` (vitest/jsdom) → **20 passed** (10 C14 + **10 C15**, `src/test/horsLigne.test.tsx`)
- `@kombe/client` **E2E navigateur (Playwright/Chromium 1243)** → **4 passed** (3 parcours + **1 hors-ligne**, `e2e/horsLigne.spec.ts`) — le test offline **coupe réellement le réseau** (`context.setOffline`) et observe la bascule d'état

### Hashes SHA-256 des artefacts C15 (au commit `336d7ed`)
| sha256 | Fichier |
|---|---|
| `078f4ed363f12e0d9e7243e7e96bafec84e6b402b391b2b1abb1f09cd65041a8` | `packages/client/src/horsLigne/moteur.ts` |
| `850308be531ca1c5184661140177577202c741e904b7e7979d51b98e3da4c648` | `packages/client/src/horsLigne/depots.ts` |
| `1ef03c694c76db16cefd381d2cb28a0efcbecc8bbff569daf6139d0ce0a71eac` | `packages/client/src/horsLigne/BandeauHorsLigne.tsx` |
| `203518ad5f80ded7ebd5a957e338a5391dc30d2b2f02bfab4a9cd8efaadc2ba2` | `packages/client/src/App.tsx` |
| `9727c7624e1f4db6ff8089609793d998f7c1c871e115a768c8325842adc365c7` | `packages/client/src/i18n/dictionnaires.ts` |
| `7c8d7edf3b3a469d2b3a2266f6c6e8fb6825ffbdb8777f0d4e06e76a9e16282d` | `packages/client/src/styles.css` |
| `2db59ca9402fb1bfd356f83040714a9c097581d810536b80fb3bd263fa85a217` | `packages/client/src/test/horsLigne.test.tsx` |
| `eb06c3fa05d7cb8ce7736af0e7033b3e0da16422dd4875380eee9fab6c31cf32` | `packages/client/e2e/horsLigne.spec.ts` |
| `_regenere_` | `harness/reports/RAPPORT_G_CONSTRUCTION.json` (au commit `336d7ed`, 11 PASS/0 FAIL/9 BLOCKED) |

## 4. Éprouver (scénarios propres à C15, jsdom + navigateur)
| ID | Montage / action réelle | Attendu (observation obligatoire) | Obtenu |
|---|---|---|---|
| **C15-OFFLINE** | brouillon « déclaration 5000 », passer hors-ligne, `soumettre()` | `server_validated = false` (statut `en_attente`, **jamais** `acceptee`) | ✅ |
| C15-OFFLINE (forme) | `creerBrouillon` avec montant `5000.50` puis `-100` | rejet (pas d'entier XAF) | ✅ |
| **C15-LOGOUT** | A enfile + met en cache ; `deconnecter("A")` ; B ouvre le même appareil | plus **aucune** portée A (`q/c/s:A::gA` absents) ; B lit 0 ; cache A `null` ⇒ `a_data_visible_to_b = false` | ✅ |
| Appareil partagé | `modePartage` : brouillon + cache | **rien n'est conservé** (file 0, cache `null`) | ✅ |
| **C15-RECONNECT** | `en_attente` hors-ligne, **rôle révoqué** côté serveur pendant la coupure, `synchroniser()` au retour | `mutation_accepted = false` (statut `refusee`, aucune `serverValide`) | ✅ |
| Idempotence | 1ʳᵉ synchro = réseau coupé (exception), 2ᵉ = OK | **même `id`** réémis (2 envois), appliqué **une seule fois**, `acceptee` | ✅ |
| Autorité d'horloge | cache TTL=60 écrit à `t=NOW` | présent à `NOW+30`, **évicté** à `NOW+61` jugé sur **horodatage serveur** (l'horloge client est ignorée) | ✅ |
| Assainissement | `{nom, tokenAcces, commentaire, referenceComplete, montant}` | seules `{nom, montant}` subsistent | ✅ |
| Bandeau (unitaire) | `role=status` hors-ligne, 2 brouillons | annonce « Hors ligne », « 2 brouillon(s) en attente — non validés par le serveur », « jamais considéré validé » ; **aucune** validation serveur revendiquée | ✅ |
| **Bandeau (E2E navigateur)** | charger `/`, `context.setOffline(true)` puis `false` | le bandeau **bascule** sur l'événement réseau réel, sans fausse validation | ✅ |

Chaque observation provient **d'actions réelles** sur le moteur (et, pour le bandeau, d'un vrai Chromium dont on coupe le réseau). Le serveur-stub **re-tranche** à l'exécution (révocation, 409, succès) ; aucune assertion ne recopie une constante d'un fichier d'attentes. Les chemins négatifs vérifient l'**absence d'effet** (une clé déjà appliquée n'est jamais rejouée deux fois ; une expirée est purgée) et la **non-revendication** (un `en_attente` n'est jamais dit validé).

## 5. Revue CodeReview — à réaliser par un harnais DISTINCT (règle H06)
`in_review` : **qoder** a produit ce lot et **ne peut** signer son propre `done`. La relecture (diff, gating brouillon≠accepté, assainissement du cache, jugé-par-serveur de l'expiration, purge de portée, idempotence à clé unique, refus sur révocation, gestion 409) doit être exécutée/signée par un harnais distinct (`claude-code` ou lead `CORNEIL333`). Points soumis :
- **Frontière = stub :** le `Transport` de test **imite** l'autorité serveur. Valider que le `mutation_accepted=false` d'une révocation repose bien sur **l'acquittement serveur** et non sur une décision client — la **vraie** garantie exigera le branchement API (C02/C03) et la déduplication d'idempotence **côté serveur** (ADR-0017).
- **Scopage/purge :** la purge s'appuie sur la convention de clés `{q|c|s}:identiteId::…`. Confirmer que tout futur conteneur de cache (service worker, IndexedDB) reprendra **le même préfixe d'identité**, faute de quoi `deconnecter` pourrait manquer une portée (fuite résiduelle sur appareil partagé).
- **TTL & horloge :** l'expiration est **déléguée** à un `serveurNow` fourni. Vérifier qu'en production cet `horodatageServeur` provient d'un **source d'heure serveur authentifiée** (pas du client, pas d'une réponse falsifiable), sinon la borne de rétention est contournable.
- **409/conflit :** `conflit` exige une **confirmation humaine** mais n'implémente pas encore le **rechargement** du state serveur. À compléter côté API ; confirmer qu'aucun écrasement silencieux n'est possible entre-temps.
- **Cache assaini par liste noire :** `assainirPourCache` retire une liste de sous-chaînes. Valider que cette approche (et non une liste blanche stricte par type de ressource) est suffisante pour la confidentialité, ou exiger une **whitelist explicite** par champ avant toute exposition de données réelles.

## 6. Limites — ce qui reste **BLOCKED / non activé** (jamais simulé)
| Scénario | Observation visée | Statut |
|---|---|---|
| Autorité/idempotence **serveur réels** (C02/C03/C05) | révocation et déduplication garanties **côté serveur**, RLS | **non activé — `Transport` stub, mécanisme client prouvé** |
| Service worker + **persistance réelle** (IndexedDB) | cache PWA maîtrisé, reprise après rechargement/kill, requêtes privées non mises en cache | **non câblé** (dépôt mémoire injecté) |
| E2E **multi-acteurs** (A/B sur appareils réels + backend) | `a_data_visible_to_b=false` garanti **hors** d'un même process | **partiel** — prouvé en logique + un navigateur ; non testé sur deux appareils réels |
| 409 **rechargement** complet | recharge du state serveur puis confirmation humaine | **à venir** (statut `conflit` posé, recharge non implémenté) |
| H03/H06/H07/H09/H10/H13/H14/H18/H20 | isolation contrôleur, identité authentifiée, base réelle, sandbox, chaîne de livraison | **BLOCKED** (limites d'environnement ADR-0010 ; cf. H00 §7) |

## 7. Rapport H00 au SHA C15
```
python harness/run_h00.py --commit 336d7ed60448dceb2e3309cf55131e6b16c68721 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED / 0 NOT_RUN**. La chaîne de contrôle d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08 mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010). **C15 n'a pas** modifié le contrôleur, les attentes ni la politique de livraison pour obtenir un statut. **Nuance propre à C15 :** le build, les 10 tests unitaires et l'E2E offline sont **réellement exécutés** (exit 0) ; le blocage H00 porte sur l'isolation/la base/la CI, **pas** sur l'existence du mécanisme client, dont C15 fournit la **preuve d'exécution**.

## 8. Défauts / dépendances restants (limites assumées, consignées — non masquées)
- **Prochaine dépendance fonctionnelle :** remplacer le `Transport` stub par l'**API réelle** (C02 auth/sessions, C03 groupe/validations, C05 calendrier) — la **vraie** autorité et la **vraie** déduplication d'idempotence (ADR-0017) s'exercent alors serveur ; les observations `server_validated`/`mutation_accepted` devront être **mesurées côté serveur**, pas seulement reconstituées côté client.
- **PWA (12.3/12.2) :** implémenter le **service worker** (cache HTTP contrôlé, éviction des requêtes privées, mise à jour du SW) et brancher `Depot` sur **IndexedDB** avec persistance des clés d'idempotence **sur disque** ; tester crash/reprise après kill applicatif.
- **Conflit (409) :** compléter le chemin `conflit` → **rechargement** du state serveur puis confirmation humaine explicite (pas d'auto-résolution).
- **Rétention/paramétrage :** exposer la **whitelist par ressource** et le **TTL adopté** en configuration versionnée (préférence à une liste blanche stricte sur la liste noire actuelle), et tracer l'**horodatage serveur authentifié** pour toute décision d'expiration.
- **CI / Conteneur (C28)** pour H03/H06/H09/H10/H13/H14/H20 ; intégration de `pnpm --filter @kombe/client test:e2e` (dont l'offline) dès qu'un exécuteur avec navigateurs est disponible.
