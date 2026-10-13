# Plan « KÓMBE, tontine réelle »

Source : prompt maître du 13 octobre 2026 (sections 4, 5 et 6). Branche d'intégration :
`claude/continue-previous-a102rx` (harnais `claude-code`). Un lot n'est `done` que si
ses vérifications ont été **exécutées** ; ce qui ne peut pas l'être ici est `BLOCKED`
avec la commande exacte (voir `docs/BLOCAGES_TONTINE_REELLE.md`).

Légende : **Dom/DB/API** = domaine pur + migration + route ; **PWA** = client React ;
**Mob** = Flutter ; **Bur.** = Espace bureau ; **Statut** = `done` / `partial` /
`BLOCKED` / `flag fermé` (implémenté au domaine, désactivé, ADR proposée).

Point de départ (13/10, SHA `08e0dce`) : domaine + migrations 0026-0028 + 62 routes
`/v1/tontines/*` prouvées sur PostgreSQL 16 ; aucun client ne les appelait.
Point d'arrivée : voir `docs/RAPPORT_FINAL_TONTINE_REELLE.md`.

Vérification commune (racine), **exécutée** :
`pnpm -r run typecheck && pnpm -r run build && pnpm -r run test`,
`scripts/proofs-local.sh` (19 preuves PostgreSQL sur bases fraîches),
`cd packages/client && KOMBE_CHROMIUM_PATH=… npx playwright test` (5 E2E),
`cd packages/mobile && flutter analyze && flutter test`.

## Incohérences (I-xx)

| ID | Sujet | Correction | Statut | Preuve | SHA |
|---|---|---|---|---|---|
| I-01 | Mots interdits | `FORBIDDEN_COPY` (épargne, solde, retrait, débité, sécurisé, garanti, chiffré…) appliqué à la PWA, au mobile (.arb + Dart), aux 4 tableaux de bord, au site | done | `packages/domain/test/copieProduit.test.ts` | `ae3e707` |
| I-02 | « Caisse commune » | caisses réelles (cagnotte, secours, fonctionnement, réserve de fin d'année, amendes) | done | E2E `tontine.spec.ts` | `259d5fa` |
| I-03 | Bornes membres | règle serveur unique 2–60, formulaire aligné | done | ADR-0036 | `259d5fa` |
| I-04 | Étape « Njangi » | création en 7 étapes (groupe → récapitulatif) | done | E2E | `259d5fa` |
| I-05 | Création qui n'envoie rien | `POST /v1/tontines` | done | E2E | `259d5fa` |
| I-06 | Saisie d'identifiants | listes cliquables (`/v1/me/tontines`, `/v1/me/dues`) | done | E2E | `259d5fa` |
| I-07 | 13 dépôts mobiles « Unavailable » | adaptateurs `Tontine*Repository` vers `/v1` | done | `flutter test` 51 PASS, `flutter analyze` 0 erreur | `4f238ca` |
| I-08 | Vocabulaire déclaré / confirmé / validé | `VALIDATION_VOCABULARY`, PWA, bureau, mobile | done | test de copie | `259d5fa` |
| I-09 | Vote sans objet exécutable | décisions votées exécutées par le serveur | done | `decisions.proof.mjs` | `79dd98d`, `1c52863` |
| I-10 | `animator` vs Président | libellés camerounais partout | done | `droits.test.ts` | `259d5fa` |
| I-11 | Hebdo calculé depuis un quantième | `cadence.ts` (6 cadences) + pause votée | done | `tontine.test.ts`, `decisions.test.ts` | `79dd98d` |
| I-12 | Un impayé bloque la clôture | dettes, avance, remise réduite ; remise complète sans caisse d'avance (correctif) | done | `tontineApi.proof.mjs`, `decisions.proof.mjs` | `79dd98d` |
| I-13 | Grâce sans effet | `lateness`, amende, graduation des sanctions | done | `decisions.proof.mjs` | `79dd98d` |
| I-14 | Pas de création d'invitation | code + lien + partage WhatsApp | done | E2E | `259d5fa` |
| I-15 | Pas de notifications | boîte de l'app + rappels + notification « decision » | done | preuves | `259d5fa` |
| I-16 | Deux clients web, trois logos | un client web, un logo (ADR-0033) | done | ADR-0033 | `aa0db96` |
| I-17 | Phrase de positionnement | `POSITIONING` FR/EN/pidgin, README | done | grep + test de copie | `7bea60e` |
| I-18 | Fonctions de l'ancienne app | via L-10/11/12/20 | done | `decisions.proof.mjs` | `4f85e2f` |
| I-19 | README « pas encore de logiciel » | README réécrit | done | — | `7bea60e` |
| I-20 | Connexion e-mail seulement | téléphone d'abord (SMS / WhatsApp / e-mail selon la configuration) | done (SMS réel : BLOCKED compte fournisseur) | E2E, `smsProvider.test.ts` | `259d5fa` |

## Fonctionnalités (L-xx)

| ID | Sujet | Dom/DB/API | PWA | Mob | Bur. | Statut | SHA |
|---|---|---|---|---|---|---|---|
| L-01 | Identité par téléphone (+237, code 6 chiffres, simulateur) | ✓ | ✓ | ✓ | ✓ | done (fournisseur SMS : BLOCKED) | `259d5fa`, `4f238ca` |
| L-02 | Tour complet de bout en bout + E2E 3 identités | ✓ | ✓ | ✓ | ✓ | done | `259d5fa` |
| L-03 | Calendrier réel (6 cadences, heure limite, Douala) ; pause votée | ✓ | ✓ | — | ✓ | done | `79dd98d` |
| L-04 | Séance (présence, statut, liaison tour) | ✓ | ✓ | — | ✓ | done | `259d5fa` |
| L-05 | Collecte en lot ; mode séance hors connexion | ✓ | ✓ | (brouillons locaux) | — | done (PWA) | `afc6b47` |
| L-06 | Remise devant témoins, PV, approbation ; PDF | ✓ | ✓ | — | ✓ (impression → PDF) | done | `44106fd` |
| L-07 | Caisses multiples | ✓ | ✓ | ✓ | ✓ | done | `259d5fa` |
| L-08 | Caisse de secours | ✓ | ✓ | — | ✓ | done | `259d5fa` |
| L-09 | Amendes et graduation des sanctions | ✓ | ✓ | — | ✓ | done | `79dd98d` |
| L-10 | Dette, avance, remise réduite, avaliseur, reprise de place | ✓ | ✓ | — | ✓ | done | `79dd98d` |
| L-11 | Bureau, mandats, destitution par vote, suppléance | ✓ | ✓ | ✓ (vote) | ✓ | done | `79dd98d` |
| L-12 | Statuts + règlement, acceptation, impression ; dépôt légalisé | ✓ | ✓ | ✓ (lecture) | ✓ | done (dépôt en préfecture : hors application) | `259d5fa` |
| L-13 | Tirage vérifiable, échange, tour prioritaire ; enchères | ✓ | ✓ | — | — | done ; enchères : flag fermé | `30adf99` |
| L-14 | Parts multiples / partagées (« demi-main ») | ✓ | ✓ | — | — | done | `79dd98d` |
| L-15 | Invitations, notifications, WhatsApp, rappels | ✓ | ✓ | ✓ | ✓ | done | `259d5fa` |
| L-16 | Canaux, frais, paiement pour autrui, diaspora | ✓ | ✓ | ✓ | ✓ | done | `4f85e2f` |
| L-17 | FR/EN/pidgin, membre sans smartphone, accessibilité ; vocal | ✓ | ✓ (pidgin bêta) | FR/EN | FR | done ; notes vocales : BLOCKED (stockage audio) | `76f7dee` |
| L-18 | Transparence configurable | ✓ | ✓ | — | ✓ | done | `259d5fa` |
| L-19 | Prêts internes | domaine | — | — | — | flag fermé (ADR-0032) | — |
| L-20 | Import historique (cahier, ancienne application) | ✓ | ✓ | — | — | done | `4f85e2f` |
| L-21 | Collecte par tontinier | domaine | — | — | — | flag fermé (ADR-0032) | — |

## Manques trouvés (X-xx, section 6)

| ID | Constat | Correction | Statut | SHA |
|---|---|---|---|---|
| X-01 | Routes absentes de l'OpenAPI ; test contrat partiel | OpenAPI complet + test runtime ↔ contrat dans les deux sens | done | `151a2a9` |
| X-02 | ADR citées inexistantes | ADR-0025 à 0038 | done | `aa0db96`, `79dd98d` |
| X-03 | Deux mécanismes d'adhésion | ADR-0036 | done | `aa0db96` |
| X-04 | Deux créations de groupe | la PWA n'utilise que `/v1/tontines` | done | `259d5fa` |
| X-05 | `minimum_members` = 3 vs 2 | règle serveur 2–60 | done | `259d5fa` |
| X-06 | `kombe_prod` à 27 jalons | migrations au build Vercel (0026 → 0030) | done | `00333cd` |
| X-07 | Downs non tolérants sur base vierge | documenté, preuves sur base migrée | done | `08e0dce` |
| X-08 | Métriques et support ouverts à tout membre | console réservée aux opérateurs (0029) | done | `93fceee` |
| X-09 | Tableaux de bord sur données fictives | 4 tableaux de bord sur données réelles | done | `44106fd` |
| X-10 | CORS sans `allow-credentials` (navigateur bloqué) | corrigé + même origine | done | `259d5fa` |
| X-11..13 | Déploiement en 3 hébergeurs | un seul projet Vercel, migrations au build | done | `00333cd` |
| X-14 | Remise d'un tour complet refusée sans caisse de fonctionnement | `planPayoutWithArrears` | done | `79dd98d` |
| X-15 | Échange de tours d'un cycle par parts : 409 à l'approbation | mise à jour en deux temps | done | `30adf99` |
| X-16 | Écran effacé quand le réseau tombe après une action | dernières données gardées | done | `afc6b47` |
| X-17 | Langue non gardée d'une ouverture à l'autre | langue mémorisée | done | `76f7dee` |
| X-18 | Mobile : chaîne de requête encodée dans le chemin | `_uri` corrigé + test | done | `4f238ca` |
