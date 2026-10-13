# KÓMBE — Bureau (console du bureau d’une association)

Poste de travail du bureau d’une tontine / association camerounaise, sur les routes « tontine réelle » de `@kombe/api` (`packages/api/src/tontine/routes.ts`). KÓMBE tient le registre ; il ne garde pas l’argent du groupe.

- Connexion par téléphone ou e-mail : `POST /v1/access/login-requests` puis `login-completions` (code hors-bande), session portée en `Authorization: Bearer` par l’`ApiClient` de `@kombe/dashboard-core`.
- Choix du groupe (`GET /v1/me/groups`), puis : vue d’ensemble, séance (ouverture, appel, collecte, confirmation en lot, remise devant témoins, clôture, procès-verbal et empreinte, approbation du PV précédent, résumé WhatsApp), file à valider (Déclarée → Confirmée par le trésorier → Validée), membres et admissions, invitations par code, bureau (proposer / accepter / mettre fin), calendrier et échanges de tours, caisses, amendes, secours, dettes, régularité, statuts, reprise d’historique.
- Les actions sont masquées selon la matrice des fonctions (`src/tontine/roles.ts`, parité testée avec `packages/domain/src/tontine/roles.ts`) ; le serveur reste juge et ses refus sont affichés tels quels.

Code : `src/tontine/` (client typé, types, vocabulaire), `src/bureau/` (écrans). L’ancien client `GroupAdminApi` (`src/api.ts`) est conservé.

```
pnpm --filter @kombe/dashboard-group-admin test
pnpm --filter @kombe/dashboard-group-admin typecheck
pnpm --filter @kombe/dashboard-group-admin build
```
