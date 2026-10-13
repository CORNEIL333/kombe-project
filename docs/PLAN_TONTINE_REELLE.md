# Plan « KÓMBE, tontine réelle »

Source : prompt maître du 13 octobre 2026 (sections 4, 5 et 6). Branche d'intégration :
`claude/continue-previous-a102rx` (harnais `claude-code`). Un lot n'est `done` que si
ses vérifications ont été **exécutées** ; ce qui ne peut pas l'être ici est `BLOCKED`
avec la commande exacte.

Légende des colonnes : **Dom/DB/API** = domaine pur + migration + route ;
**PWA** = client React ; **Mob** = Flutter ; **Statut** = `todo` / `in_progress` /
`partial` (serveur livré, client manquant) / `done` / `BLOCKED`.

Point de départ (13/10, après intégration, SHA `08e0dce`) : domaine + migrations
0026-0028 + 62 routes `/v1/tontines/*` livrés par la session précédente et prouvés
sur PostgreSQL 16 (`tontineApi.proof.mjs`, 44 vérifications). Aucun client ne les
appelle encore ; aucune ADR 0025+ n'existe ; l'OpenAPI ne les décrit pas.

Vérification commune (racine) :
`pnpm -r run typecheck && pnpm -r run build && pnpm -r run test` puis
`scripts/proofs-local.sh` (pour chaque preuve : base fraîche, `migrate.mjs migrate`, preuve).

## Incohérences (I-xx)

| ID | Sujet | Dom/DB/API | PWA | Mob | Statut | Preuve / vérification |
|---|---|---|---|---|---|---|
| I-01 | Mots interdits (épargne, solde, retrait, débité, fonds protégés…) + test bloquant | `tontineCopy.test.ts` (API) | à purger + test dictionnaires | `.arb` à purger | todo | `pnpm --filter @kombe/client test` |
| I-02 | « Caisse commune » inexistante dans le moteur | n/a | à remplacer par les caisses réelles | — | todo | test parcours création |
| I-03 | Bornes membres (3–1000 / 2 / 8–12) | `maxMembers` règles serveur | à lire du serveur (2–60) | — | todo | X-05 |
| I-04 | Étape « Njangi » | n/a | étapes Groupe → Récapitulatif | — | todo | test parcours |
| I-05 | Création qui n'envoie rien | `POST /v1/tontines` | à brancher | — | todo | E2E L-02 |
| I-06 | Saisie manuelle des identifiants | `/v1/me/tontines`, `/v1/me/dues` | listes cliquables | — | todo | E2E L-02 |
| I-07 | 13 dépôts mobiles `Unavailable*` | API prête | — | `Http*Repository` | todo (vérif. BLOCKED : pas de Flutter) | `cd packages/mobile && flutter analyze && flutter test` |
| I-08 | Vocabulaire déclaré / confirmé / validé | API conforme | à aligner | à aligner | todo | test copie |
| I-09 | Vote sur un objet non exécutable | — | — | — | todo | test domaine |
| I-10 | `animator` vs Président | rôles L-11 en base | libellés camerounais | libellés | partial | |
| I-11 | Hebdo calculé depuis un quantième | `cadence.ts` | — | — | partial (L-03) | `tontine.test.ts` |
| I-12 | Un impayé bloque la clôture | dettes + avance | — | — | partial (L-10) | `tontineApi.proof.mjs` |
| I-13 | Grâce sans effet | `lateness` + amende | — | — | partial (L-09) | idem |
| I-14 | Pas de création d'invitation | `POST …/invitations` | partage WhatsApp | — | partial (L-15) | idem |
| I-15 | Pas de notifications | `GET /v1/me/notifications` | centre de notifications | — | partial | idem |
| I-16 | Deux clients web, trois logos | — | — | — | todo (ADR) | ADR-0026 |
| I-17 | Phrase de positionnement unique | README | app | app | todo | grep |
| I-18 | Fonctions de l'ancienne app Firebase | via L-10/11/12 | — | — | partial (L-20) | |
| I-19 | README « pas encore de logiciel » | à vérifier | — | — | todo | |
| I-20 | Connexion e-mail seulement | SMS + WhatsApp + e-mail | à brancher | — | partial (L-01) | |

## Fonctionnalités (L-xx)

| ID | Sujet | Dom/DB/API | PWA | Mob | Statut |
|---|---|---|---|---|---|
| L-01 | Identité par téléphone (+237, code 6 chiffres, simulateur) | livré | todo | todo | partial |
| L-02 | Tour complet de bout en bout + E2E Playwright 3 identités | livré | todo | todo | todo |
| L-03 | Calendrier réel (6 cadences, heure limite, Douala) ; pause votée | cadences livrées ; pause : domaine seul | — | — | partial |
| L-04 | Séance (présence, statut, liaison tour) | livré | todo | todo | partial |
| L-05 | Collecte en lot ; mode séance hors connexion | lot livré ; hors connexion : todo | todo | todo | partial |
| L-06 | Remise devant témoins, PV, approbation ; export PDF | livré sauf PDF | todo | todo | partial |
| L-07 | Caisses multiples | livré | todo | todo | partial |
| L-08 | Caisse de secours | livré | todo | todo | partial |
| L-09 | Amendes et discipline (graduation) | amendes livrées ; graduation : todo | todo | todo | partial |
| L-10 | Dette, avance, remise réduite, avaliseur, reprise de place, ordre de confiance | sauf reprise de place | todo | todo | partial |
| L-11 | Bureau, mandats, destitution par vote, suppléance | rôles + mandats ; destitution : domaine seul | todo | todo | partial |
| L-12 | Statuts + règlement, acceptation, PDF, dépôt légalisé | sauf PDF / dépôt | todo | todo | partial |
| L-13 | Tirage vérifiable, échange, priorité, enchères (drapeau) | tirage + échange ; priorité/enchères : domaine | todo | todo | partial |
| L-14 | Parts multiples / partagées | parts multiples livrées ; parts partagées : todo | todo | todo | partial |
| L-15 | Invitations, notifications, WhatsApp, rappels | livré (boîte interne + lien WhatsApp) | todo | todo | partial |
| L-16 | Canaux, frais de retrait, paiement pour autrui, diaspora | sauf diaspora | todo | todo | partial |
| L-17 | FR/EN/pidgin, membre sans smartphone, vocal, accessibilité | membre hors ligne livré ; vocal todo | todo | todo | partial |
| L-18 | Transparence configurable | livré | todo | todo | partial |
| L-19 | Prêts internes (drapeau fermé, ADR proposée) | domaine | — | — | todo |
| L-20 | Import historique Firebase lecture seule | domaine | — | — | todo |
| L-21 | Collecte par tontinier (drapeau fermé) | domaine | — | — | todo |

## Manques trouvés (X-xx, section 6)

| ID | Constat | Correction | Statut |
|---|---|---|---|
| X-01 | 62 routes `/v1/tontines/*` absentes de `docs/openapi.yaml` ; le test contrat ne compare pas toutes les routes du runtime | décrire les routes + test « toute route du serveur est au contrat » | todo |
| X-02 | Le code cite ADR-0025 à 0032, aucune n'existe | rédiger les ADR (téléphone, client web unique, caisses/amendes, défaut et dette, bureau, calendrier, choix par défaut, extensions) | todo |
| X-03 | Deux mécanismes d'adhésion : `group.join_code` + parrainage (0024, en prod) et invitations à code (0026) | ADR : l'invitation à code est la voie produit ; l'amorçage reste pour la compatibilité | todo |
| X-04 | Deux créations de groupe : `POST /v1/groups` (amorçage) et `POST /v1/tontines` | idem : la PWA n'utilise que `/v1/tontines` | todo |
| X-05 | `minimum_members` = 3 (0024) contre ≥ 2 dans le domaine tontine | aligner la borne (règle serveur, défaut 2–60) | todo |
| X-06 | `kombe_prod` est à 27 jalons ; 0026-0028 restent à appliquer au déploiement | runbook : `migrate` avant la mise en ligne de l'API | todo |
| X-07 | Downs 0001-0023 non tolérants sur base vierge (les preuves exigent une base migrée) | documenté ; pas de régression | done (`08e0dce`) |
