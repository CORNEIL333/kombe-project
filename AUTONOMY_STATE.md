# AUTONOMY_STATE — KÓMBE

Mémoire de reprise du mode autonome continu. Actions du porteur, avec leurs étapes exactes : `ACTIONS_PROPRIETAIRE.md` (directive du 10/11/2026). À relire en début de session, avec `docs/production-readiness/` (runbook 11, verdict 13, registre 02).

## Objectif général

KÓMBE est un registre partagé de tontines. Il ne détient, ne reçoit ni ne transfère jamais d'argent.

Le but est de le mener à une production sûre, mesurée et documentée, avec :
- la PWA des membres ;
- l'application mobile Flutter ;
- l'Espace bureau ;
- le CRM de la plateforme (`/crm/`) ;
- l'API Fastify et PostgreSQL (Neon).

## Garde-fous permanents (rappel)

**Base de données**
- Aucune commande destructive sur la base de production sans autorisation explicite.
- Sauvegarde Neon (`scripts/neon-sauvegarde.mjs`) avant toute migration en production.

**Code et secrets**
- Aucun secret dans le dépôt : ils vivent dans les fichiers du scratchpad (`.vercel_token`, `.neon_key`, `.prod_uri`).
- Ne jamais désactiver une sécurité pour faire passer un test.
- Ne jamais déclarer PASS sans exécution réelle.

**Produit**
- Montants en XAF entiers.
- Mots interdits dans les textes (au sens financier) : épargne, solde, retrait, débité, sécurisé, garanti.
- Modules fermés (prêts, enchères, tontinier) : ne pas activer.

**Git**
- Ne pas toucher à la PR #1 ni à la branche `design/orbite-v2`.
- Ne pas modifier les fichiers de recette du harnais (`harness/run_h00.py`, `verify_gate.py`, `*.schema.json`, `verifier_coordination.py`).
- Branche de travail : `claude/continue-previous-a102rx`.
- Fusion dans `master` par PR, autorisée par le porteur le 09/11.

## État au 11/11/2026

- **Production 0.9.1 en ligne** : `dpl_E7usZ2pak29Hh6FnLmAWXkNncJvr`, `master` à `d21c816`, migrations jusqu'à 0043.
  - Retour arrière : `dpl_CgSFBHhi6tK8Caz3iFAxHEAWyEph` (0.9.0).
- **Sauvegardes Neon :**
  - `sauvegarde-avant-0-9-1-20261110` ;
  - `sauvegarde-avant-0-9-0-20261109` ;
  - `sauvegarde-avant-0-8-1-20261106`.
  - Le projet est à 10 branches sur 10 : une prochaine sauvegarde exige de supprimer la plus ancienne, avec l'accord du porteur.
- **Vérifications :**
  - 29/29 preuves PostgreSQL ;
  - tests unitaires et vérification de types verts dans tous les paquets ;
  - smoke test de production réussi ;
  - `pnpm audit --prod` : 0 vulnérabilité.

## Lots terminés (DONE)

- Durcissement P0/P1 :
  - idempotence ;
  - opérateurs avec second facteur ;
  - OTP poivrés ;
  - limitation partagée ;
  - outbox ;
  - garde de build ;
  - CI des preuves.
- Charge 5 000 personnes simultanées ; rôle `kombe_api` et pooler (R-03).
- CRM de la plateforme (ADR-0046) et assistance côté PWA.
- Sécurité :
  - V-18 (routes vie privée réservées à l'admin) ;
  - R-01 (jetons de session hachés) ;
  - R-02 (RLS des tables vie privée) ;
  - R-05 (relève des envois différés).
- Fusion de `lots/retours-membres` (0043) ; production 0.9.1 ; fusion dans `master` (PR #6 et #7).

## Backlog priorisé

| # | Lot | Statut | Note |
|---|---|---|---|
| A1 | `migrate.mjs` : modes `status` et `down` | DONE (11/11) | Testés en local (6 cas) ; `status` lancé sur la production : 46 jalons, rien en attente. |
| A2 | Mobile : écran « Mes demandes au support » | DONE (11/11) | Liste, nouvelle demande, fil, réponse, note ; notification → demande. `flutter analyze` sans erreur ; 75 tests mobiles verts, dont 4 nouveaux. À livrer avec la prochaine publication mobile (B3). |
| A3 | R-04 : « mes tontines » en moins d'allers-retours | DONE dans le code (11/11), déploiement BLOCKED (B7) | 32 → 20 instructions par appel (3 groupes), réponses identiques ; preuves tontineApi, tontineCycles, customFunds, echeances, retoursMembres, serverRealMode vertes. |
| A4 | CRM : prévenir le support d'une nouvelle demande | DONE dans le code (11/11), déploiement BLOCKED (B7) | Migration 0044 : alerte aux opérateurs support, opérations et admin (référence seule), réponse du membre adressée au responsable. Preuve crm 45/45. |
| A5 | RLS de `"group"` (résiduel R-02) | DONE dans le code (11/11), déploiement BLOCKED (B7) | Migration 0045 ; 29/29 preuves ; parcours navigateur 40 pages sans erreur. |
| A6 | Guide du back-office (artefact) | DONE (11/11) | Version 3 publiée. |
| A7 | Parcours navigateur de bout en bout dans le dépôt | DONE (11/11) | `scripts/e2e/parcours-crm.mjs` (40 pages, axe-core en dépendance de développement) : PASS. |
| A11 | ADR-0047 (sécurité résiduelle, alertes, lectures) | DONE (11/11) | |
| A8 | PWA : tests de l'écran Aide (assistance) | DONE (11/11) | `aide.test.tsx` : 3 tests (liste, nouvelle demande, fil, réponse, note) ; client 38/38. |
| A9 | Délais de service : alerte avant dépassement | DONE dans le code (11/11), déploiement BLOCKED (B7) | Migration 0046 `kombe_crm_sla_scan` : P1/P2 30 min avant, P3/P4 en retard, une alerte par demande et par échéance ; relève toutes les 5 min et tâche quotidienne ; preuve crm 46/46 ; 29/29. |
| A10 | Intégrité (audit §6.3) : une seule séance ouverte, RLS de `command`, vocabulaire PWA/mobile/site | DONE dans le code (12/11), déploiement BLOCKED (B7) pour 0047 | Index unique partiel ; preuve MEETING-ONE-OPEN-DB ; gardes `copieProduit.test.ts` et `vocabulaire_test.dart`. |
| A12 | Mobile : traduction anglaise complète | DONE (12/11) | Tous les écrans, libellés partagés (`KombeL10n`, `core/formatters/labels.dart`), notifications, erreurs et dates (FR/EN). Preuve : `test/golden/english_tour_test.dart` parcourt les 35 écrans du tour en anglais sans texte d'interface français (contrôle négatif : en français, il en trouve sur 32 routes). Suite mobile 80/80, goldens français inchangés. Limite connue : les messages rédigés par le serveur restent en français ; l'écran Langue le dit. Publication : B3. |
| A13 | Motifs d'erreur de l'API en anglais | DONE dans le code (12/11), déploiement avec B7 | `packages/api/src/i18n/errorsEn.ts` : 343 motifs fixes et 15 gabarits des routes produit ; `Accept-Language: en` en premier choix → anglais, sinon français inchangé. Le mobile et la PWA envoient leur langue (le pidgin lit l'anglais). Garde `test/errorsEn.test.ts` (relit les sources : tout nouveau motif sans anglais fait échouer) ; API 268/268, client 43/43, 29/29 preuves PostgreSQL, mobile 81/81. |
| A14 | Push Web pour la PWA (moitié Web de R-07) | DONE dans le code (12/11), déploiement avec B7 | ADR-0048. Sans migration (`push_device` accepte `web`). API : `WebPushProvider`, `CombinedPushProvider`, `GET /v1/push/web-key` ; PWA : `sw-notifications.js` (sans cache), « Sur ce navigateur » dans les préférences. Fermé sans clés VAPID, et rien ne part sans `KOMBE_NOTIFY_EXTERNAL=on` (porteur). API 273/273, client 47/47, preuves notificationDelivery, serverRealMode, tontineApi vertes. |
| A15 | Notifications hors application dans la langue du profil | DONE dans le code (12/11), déploiement avec B7 (migration 0048) | `kombe_notification_locale` lit `identity_profile.language` ; titres anglais pour chaque type, SMS et e-mail compris ; le mobile synchronise la langue du profil à la connexion et à chaque changement (la PWA le faisait déjà). Preuves : API 277/277, notificationDelivery LOCALE-*, 29/29 preuves PostgreSQL, mobile 82/82 dont `langue_profil_test.dart`. |
| A16 | Site public en anglais, contrastes WCAG AA du site | DONE (12/11) | 10 pages `/site/en/` régénérables (`apps/site/scripts/en/build-en.sh`), sélecteur FR/EN et hreflang, PWA ouverte en anglais via `/?lang=en`. Pages françaises et générateur à jour (langues, assistance, notifications du navigateur, stockage local). `scripts/e2e/parcours-site.mjs` PASS (80 chargements, axe sans violation) ; client 49/49. Le site garde « SAV bientôt » tant qu'aucun opérateur ne répond (B2). |
| A17 | Espace bureau en anglais | DONE (13/11) | Socle des tableaux de bord traduisible (catalogue indexé par le français, langue suivie depuis l'application, Accept-Language), catalogue `english.ts` de l'Espace bureau gardé par `english.test.ts`, libellés du registre servis en anglais par l'API. `scripts/e2e/parcours-bureau.mjs` PASS 36/36 (9 pages × FR/EN × 1280/390, axe sans violation, aucun texte français resté) ; CRM PASS 40/40. Limite : statuts et procès-verbaux générés restent rédigés en français (marqués `lang="fr"`, signalés en anglais) ; exports CSV en français. |
| B1 | Relier Vercel à GitHub (déploiement automatique depuis `master`) | BLOCKED | Refusé par le classificateur (réglage du compte) : action du porteur (Vercel → Settings → Git). |
| B2 | Premier opérateur en production | BLOCKED | Identité du porteur : `grant-operator.mjs`, puis second facteur. |
| B3 | Publication de l'application mobile | BLOCKED | Clé de signature sur le PC du porteur. |
| B4 | Notifications push (R-07) | BLOCKED | Projet Firebase et `google-services.json` du porteur. |
| B5 | Plan Neon payant, branches de prévisualisation anciennes | BLOCKED | Décision d'achat et de suppression du porteur. |
| B6 | Validations juridiques (loi 2024/017, CEMAC/COBAC) | BLOCKED | Juriste. |
| B8 | CI GitHub Actions | BLOCKED | Tous les jobs s'arrêtent en 1 s sans démarrer (constaté le 11/11 sur 704 exécutions récentes) : compte ou limite de facturation GitHub, à lever par le porteur. Les preuves locales (`scripts/proofs-local.sh`) font foi en attendant. |
| B7 | Déployer 0044 à 0048 (alertes support, RLS de "group", délais, intégrité) et R-04 | BLOCKED | Sauvegarde Neon obligatoire, mais 10 branches sur 10 : il faut que le porteur supprime `sauvegarde-avant-0-8-1-20261106` (ou autorise sa suppression). |

## Décisions techniques importantes

- Conteneur recréé le 12/11 (travail non poussé perdu une fois, refait) : pousser après chaque étape vérifiée. Remise en route : `pnpm install`, `pnpm -r build`, `pg_ctlcluster 16 main start`, mot de passe local du superutilisateur pour `scripts/proofs-local.sh` (`~/.pgpass`), Flutter 3.47.6 dans `/opt/flutter` (archive stable officielle).

- La branche `claude/project-thread-tr7vq3` (13/10) n'est pas fusionnée : son contenu a été remplacé par des versions plus récentes, sauf `migrate.mjs status/down` (lot A1).
- R-04 est reporté au palier 50 000 le 09/11, puis repris en A3 sous forme mesurée, sans réécrire le calcul des échéances.
- La table `"group"` a sa RLS dans le code (A5, 0045), en attente de déploiement (B7).

## Lot en cours

Aucun : A12 à A17 terminés (13/11).

## Prochaine action concrète

Sélectionner le lot suivant (A12 à A15 terminés ; B7 attend toujours la place de sauvegarde Neon, et emportera A13 à A15, migrations 0044 à 0048 ; au déploiement, générer et poser les clés VAPID). Après le redémarrage du conteneur (12/11), les accès Vercel et Neon gardés dans le bloc-notes sont perdus : le déploiement B7 demandera de les reposer.
