# 10 — Tests et matrice adverse

## Suites exécutées le 12/11/2026 (toutes vertes)

Lots A12 (mobile en anglais) et A13 (motifs d'erreur en anglais) :

- **Unitaires :**
  - api 268, dont `errorsEn.test.ts` (relit les sources : un motif des routes produit sans version anglaise fait échouer la suite) ;
  - client 43, dont `langueApi.test.ts` ;
  - mobile 81 (3 ignorés), dont `english_tour_test.dart` : les 35 écrans du tour, en anglais, sans texte d'interface français. Contrôle négatif fait : en français, le même test signale 32 routes.
- **PostgreSQL 16 réel :** 29/29 (migrations jusqu'à 0047).
- **Non relancés ce jour (paquets inchangés) :** domain, dashboard-core, CRM, bureau.

## Suites exécutées le 11/11/2026 (toutes vertes)

- **Unitaires :**
  - domain 451 ;
  - api 261 ;
  - dashboard-core 35 ;
  - client 35 ;
  - CRM 16 ;
  - bureau 3 ;
  - mobile 75 (3 ignorés).
- **PostgreSQL 16 réel :** 29/29 (`scripts/proofs-local.sh`, migrations jusqu'à 0045).
- **Parcours navigateur de bout en bout** : `scripts/e2e/parcours-crm.mjs`, **PASS**, 40 pages (CRM et PWA, 1280 et 390 px).
  - Contrôles par page : aucune erreur JavaScript, aucune erreur `/v1`, aucun défilement horizontal, aucune violation axe (WCAG 2.2 AA).
  - Le script refuse de viser la production.
  - Lancement : API locale sur une base jetable avec `KOMBE_WEB_ROOT=dist-web`, puis `KOMBE_DATABASE_URL=<rôle propriétaire> node scripts/e2e/parcours-crm.mjs`.
- **CI GitHub Actions :** bloquée côté compte (jobs arrêtés en 1 s, voir `AUTONOMY_STATE.md`, B8). Les exécutions locales font foi.

## Suites exécutées le 04/11/2026 (toutes vertes)

**Tests unitaires**

| Paquet | Résultat |
|---|---|
| domain | 451/451 |
| api | 256/256 (dont le contrat OpenAPI ↔ exécution) |
| dashboard-core | 35/35 |
| client (PWA) | 34/34 |
| consoles | 11/11 |
| mobile (Flutter, après fusion) | 60 réussis, 1 ignoré : le golden de la visite, qui ne tourne qu'avec `KOMBE_TOUR`. `flutter analyze` : 0 erreur. |

**Preuves sur PostgreSQL 16 réel** (`scripts/proofs-local.sh`, et en CI `proofs-postgres.yml`) : **28/28 PASS** (07/11/2026, dont `crm.proof.mjs`), en connexion directe comme via PgBouncer (`kombe_api`).
- Preuves historiques : isolation, journal, contributions, validations, recours, versements, propositions, règles, calendrier, sessions, métriques, découverte du worker, mode réel du serveur, API tontine, cycles, décisions, caisses, échéances, Neon Auth, migration à vide, console.
- Nouvelles preuves : `idempotence` (10 contrôles), `operatorSecurity` (25, dont 4 de RLS), `authHardening`, `notificationDelivery` (26).

**Autres vérifications.**
- **Navigateur (Chromium)** :
  - parcours du second facteur opérateur ;
  - panneau des préférences de notification à 390 px, sans défilement horizontal ;
  - accessibilité axe : 24/24.
- **Répétition sur une copie de la production** : voir 06.

## Matrice adverse

| # | Scénario | Verdict | Preuve |
|---|---|---|---|
| 1 | Un membre du groupe A lit ou écrit des données du groupe B (IDOR/BOLA) | **PASS** | `isolation.pg` C01 (0 ligne croisée, aucune fuite par le pool), `tontineApi` |
| 2 | Escalade : un membre exécute un acte réservé au bureau, ou s'attribue un rôle opérateur | **PASS** | `tontineApi`, `decisions` ; `operatorSecurity` RLS-NO-OPERATOR-SELF-GRANT |
| 3 | Double soumission ou concurrence sur une déclaration financière | **PASS** | `idempotence` : 20 requêtes concurrentes → 1 effet ; même clé avec un autre corps → 409 |
| 4 | Panne entre l'effet et la mémorisation (effet orphelin) | **PASS** | `idempotence` FAILURE-NO-ORPHAN-EFFECT ; défaut reproduit sur l'ancien code avant correctif |
| 5 | Force brute sur un code OTP | **PASS** | `authHardening` : verrouillage après 5 codes faux |
| 6 | Rafale de demandes de code (coût SMS), répartie sur plusieurs instances | **PASS** | `authHardening` : limite partagée, 7e demande → 429 entre 2 instances |
| 7 | Console opérateur avec une session volée sans second facteur, ou rejeu d'un code TOTP | **PASS** | `operatorSecurity` (MFA-REQUIRED, TOTP-REPLAY-REFUSED, THROTTLE 5×400 puis 429) ; Chromium |
| 8 | Support JIT : auto-approbation, version périmée, action financière | **PASS** | `operatorSecurity` : refusés, journal durable après 403 |
| 9 | Accès SQL arbitraire sous une session membre : énumération des comptes, compteurs, registre | **PASS** | `operatorSecurity` : 4 contrôles RLS (42501, 1 ligne visible) |
| 10 | Falsification de la file d'envoi, ou double livraison par deux instances | **PASS** | `notificationDelivery` : RLS-OUTBOX (lecture de ses lignes seulement, écriture 42501), LEASE-NO-DOUBLE-DELIVERY 12/12 |
| 11 | Déploiement en production sans migration ou sans secrets | **PASS** | `vercel-build.mjs` simulé (`VERCEL=1`, `VERCEL_ENV=production`) : exit 1 dans les deux cas, avant toute migration |
| 12 | Altération du journal (mise à jour ou suppression d'un acte) | **PASS** | `isolation.pg` C04_IMMUTABLE ; `pgJournalStore` (chaîne d'empreintes) |

## Non testé (NOT_TESTED, honnêtement)

- Lecteurs d'écran réels.
- Charge sur Neon distant et démarrages à froid.
- Envois réels FCM, SMS et e-mail : aucun fournisseur n'est configuré, et l'ouverture est une décision du propriétaire.
- WebAuthn : non implémenté (R-06).
- Test d'intrusion par un tiers.
- Application iOS.
