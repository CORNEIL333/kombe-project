# KÓMBE

**KÓMBE tient le registre de votre tontine et de votre association. Il ne garde pas votre argent.**

Les tontines camerounaises vivent en séance : on fait l'appel, on cotise,
quelqu'un « bouffe » devant témoins, on verse le secours, on note les amendes,
et le secrétaire écrit le procès-verbal. KÓMBE fait tout cela sur le téléphone
de chaque membre, sans jamais toucher l'argent : chaque versement est
**déclaré** par la personne, **confirmé** par le trésorier et, s'il y a un
commissaire aux comptes, **validé** par lui. Rien ne s'efface : tout est chaîné
dans un registre vérifiable.

## Ce que l'application fait

| Besoin d'une vraie tontine | Dans KÓMBE |
|---|---|
| Entrer avec son numéro de téléphone | Code à 6 chiffres par SMS (+237), aucun mot de passe |
| Créer l'association et son règlement | Cotisation par part, cadence (hebdo, quinzaine, mensuel, « 2e dimanche »…), lieu, transparence, amendes, caisse de secours, fonds de caisse, réserve de fin d'année |
| Inviter | Lien et code à partager sur WhatsApp, admission par le bureau, parrain/avaliseur, membres sans téléphone représentés par un mandataire |
| Le bureau | Président, vice-président, secrétaire, trésorier et adjoint, commissaire aux comptes, censeur, conseiller ; passation et mandats |
| Statuts | Générés depuis le règlement, acceptés par chaque membre sur leur empreinte exacte |
| L'ordre de passage | Tirage scellé vérifiable (engagement puis révélation), ordre manuel ou d'arrivée, plusieurs parts par membre (jusqu'à 5), échange de tour accepté par les deux personnes et approuvé par le bureau |
| La séance | Ouverture, appel (présent, retard, excusé, représenté), cotisations en lot, remise devant témoins présents, accusé de réception du bénéficiaire, amendes d'absence et de retard automatiques, procès-verbal généré et approuvé à la séance suivante |
| L'argent | Orange Money, MTN MoMo, espèces, banque ; référence exigée pour le mobile money ; plusieurs caisses (cagnotte, secours, fonds de caisse, amendes, réserve) |
| Les impayés | Remise intégrale avec avance du fonds de caisse, remise réduite ou attente ; dettes suivies et remboursées ; abandon motivé par la présidence |
| Les coups durs | Demande de secours selon le barème (naissance, décès, mariage, maladie), plafonds annuels, décision par une personne distincte, remise tracée |
| Confiance | Registre chaîné par empreintes SHA-256 et revérifié à chaque lecture, cloisonnement par association au niveau de la base (RLS), séparation des rôles imposée par la base elle-même |

## Organisation du dépôt

| Dossier | Contenu |
|---|---|
| `packages/domain` | Règles métier pures (TypeScript), testées |
| `packages/db` | Schéma PostgreSQL 16, migrations 0001 à 0026, rôles et cloisonnement |
| `packages/api` | API Fastify ; l'API produit est dans `src/tontine/` ([contrat](docs/API_TONTINE.md)) |
| `packages/client` | Application web installable (PWA, React) |
| `packages/mobile` | Application mobile Flutter (Android, iOS) |
| `apps/dashboard-*` | Tableaux de bord (bureau, opérations, direction, technique) |
| `packages/worker` | Envoi différé des messages (outbox) |

## Démarrer en local

```bash
pnpm install
pnpm -r --if-present run build
docker compose up -d postgres                         # ou un PostgreSQL 16 local
export KOMBE_DATABASE_URL=postgresql://kombe:kombe_dev_only@localhost:5432/kombe
node packages/db/scripts/migrate.mjs migrate
KOMBE_API_DATABASE_URL=$KOMBE_DATABASE_URL KOMBE_CORS_ORIGINS=http://localhost:5173 \
  pnpm --filter @kombe/api run start                  # API sur :3000
VITE_KOMBE_API_BASE_URL=http://localhost:3000 pnpm --filter @kombe/client run dev   # PWA sur :5173
```

En développement, aucun SMS ne part : le code de connexion est renvoyé par
l'API (`devCode`) et affiché par l'application. Le déploiement est décrit dans
[`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

## Tests

```bash
pnpm -r --if-present run test                       # tests unitaires de tous les paquets
export KOMBE_TEST_DATABASE_URL=...                  # base PostgreSQL jetable
node packages/db/tests/isolation.pg.mjs             # cloisonnement et règles de la base
KOMBE_API_DATABASE_URL=$KOMBE_TEST_DATABASE_URL node packages/api/test/tontineApi.proof.mjs   # parcours réel complet
```

Le dossier `KOMBE_Audit_Construction/` reste la base documentaire d'origine ;
il n'est pas modifié.
