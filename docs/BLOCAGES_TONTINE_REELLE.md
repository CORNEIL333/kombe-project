# Blocages — « KÓMBE, tontine réelle »

Ce qui n'a **pas** pu être exécuté dans la session cloud (aucun compte
fournisseur, aucun secret, aucun déploiement : interdits par le prompt maître),
avec la commande exacte qui lève le blocage. Rien ici n'est déclaré PASS.

Date : 13 octobre 2026 · branche `claude/continue-previous-a102rx`.

## A. Mise en ligne (à faire par le porteur, ~15 minutes)

| # | Blocage | Pourquoi bloqué ici | Commande / action exacte | Vérification |
|---|---|---|---|---|
| A1 | Projet Vercel + variables de production | créer un compte / toucher des secrets est interdit à l'agent | `docs/deployment/MORNING_SETUP.md` §1–2 (`KOMBE_API_DATABASE_URL`, `KOMBE_MIGRATION_DATABASE_URL`, `RESEND_API_KEY`, `KOMBE_EMAIL_FROM`) | `KOMBE_SMOKE_BASE_URL=https://<projet>.vercel.app node scripts/release-smoke.mjs` → `SMOKE_PASS` |
| A2 | Migrations 0026 → 0030 sur `kombe_prod` (27 jalons aujourd'hui) | pas d'accès à la production | automatique au build Vercel de production ; à la main : `KOMBE_DATABASE_URL=<neondb_owner> node packages/db/scripts/migrate.mjs migrate` | `/engineering/` → « Schéma : À jour » (30 migrations + rôles) |
| A3 | Opérateur de la plateforme | dépend d'A1 | `KOMBE_DATABASE_URL=<neondb_owner> node packages/db/scripts/grant-operator.mjs <votre-identifiant>` | `/ops/` s'ouvre |

## B. Fournisseurs (comptes à créer par le porteur)

| # | Blocage | Commande / action | Vérification |
|---|---|---|---|
| B1 | **SMS réel** (connexion par téléphone, la plus naturelle au Cameroun) | compte Africa's Talking, puis `KOMBE_SMS_PROVIDER=africastalking`, `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY` dans Vercel | `curl https://<projet>/v1/auth/channels` → `"sms": true` ; un vrai code reçu sur un numéro +237 |
| B2 | **WhatsApp** (code par WhatsApp) | compte Meta WhatsApp Business + modèle de message approuvé ; tant qu'il manque, la voie est fermée proprement | `/v1/auth/channels` → `"whatsapp": true` |
| B3 | **E-mail à tous** | domaine vérifié chez Resend (DKIM/SPF), `KOMBE_EMAIL_FROM=no-reply@<domaine>` ; sans cela seul le propriétaire du compte Resend reçoit les codes | un code reçu sur une adresse tierce |
| B4 | Domaine personnalisé | Vercel → Domains (`app.kombe.cm`…) ; les liens d'invitation le prennent automatiquement | lien WhatsApp d'invitation ouvert depuis un autre téléphone |

## C. Application mobile Flutter

| # | Blocage | Commande exacte | Ce qui est déjà prouvé |
|---|---|---|---|
| C1 | APK / AAB signé (Play Store) | Android SDK + clé de signature absents ici : `cd packages/mobile && flutter build appbundle --release --dart-define=KOMBE_API_BASE_URL=https://<projet>/v1` | `flutter analyze` 0 erreur / 0 avertissement, `flutter test` 51 PASS (goldens compris) |
| C2 | iOS | macOS + Xcode + compte Apple Developer | — |
| C3 | Parcours mobile contre l'API réelle sur un appareil | aucun émulateur ici ; `flutter run --dart-define=KOMBE_API_BASE_URL=http://<ip-locale>:3000/v1` avec `scripts/…/api` en mode simulateur | contrats HTTP prouvés par `test/data/remote/tontine_repositories_test.dart` (MockClient : chemins, clés d'idempotence, montants entiers) |
| C4 | Écrans mobiles encore absents | ouverture d'un vote, reprise du cahier, tour prioritaire, séance sans réseau : **dans la PWA** (installable sur Android depuis le navigateur) ; le mobile vote, déclare, confirme, lit | — |

## D. Exploitation et sécurité

| # | Blocage | Action | Pourquoi c'est acceptable au pilote |
|---|---|---|---|
| D1 | **Double authentification des opérateurs** non implémentée | à faire avant ouverture large : TOTP sur `/ops`, `/direction`, `/engineering` | la console n'expose que des agrégats (aucun montant individuel, aucun numéro complet) ; accès accordé à la main |
| D2 | Exercice de **sauvegarde / restauration** | `pg_dump --format=custom "$KOMBE_PROD_URL" > kombe.dump && createdb kombe_restore && pg_restore -d kombe_restore kombe.dump && KOMBE_DATABASE_URL=…/kombe_restore node packages/db/scripts/migrate.mjs status` | Neon offre la restauration à un instant donné ; l'exercice complet reste à faire et à dater |
| D3 | Numéro d'astreinte, contact données personnelles | `/ops/` → Incidents & runbooks | exigé avant ouverture au public |
| D4 | Notes vocales (L-17) | stockage objet + consentement + durée de conservation à décider | les membres sans smartphone sont représentés (L-17) ; le texte suffit au pilote |

## E. Décisions qui reviennent au porteur (choix par défaut appliqués, ADR « PROPOSÉ »)

| ADR | Choix par défaut à confirmer |
|---|---|
| 0034 | Association complète (cagnotte, secours, amendes, fonctionnement, réserve de fin d'année) ; amendes dès le pilote ; « réserve de fin d'année » ; import de l'historique en lecture seule ; « qui a payé » visible de tous (configurable) ; tontinier et prêts implémentés mais fermés |
| 0038 | Majorité **absolue des électeurs** pour toute décision ; 72 h minimum pour destitution et exclusion, 24 h sinon ; membres sans téléphone hors du corps électoral ; sommes versées par un exclu qui n'a pas bouffé : rendues « selon les statuts » (hors application) |
| 0029 | Barème d'amendes et de secours : fixé par chaque groupe, aucun montant imposé |
| 0032 | **Prêts internes, enchères, tontinier** : restent **fermés** ; ouverture seulement après avis juridique (réglementation COBAC / microfinance) — l'agent ne les active jamais |
| L-17 | Pidgin (bêta) : à relire par des locuteurs du Nord-Ouest / Sud-Ouest avant de le présenter comme langue complète |
