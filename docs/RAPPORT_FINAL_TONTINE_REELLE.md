# Rapport final — « KÓMBE, tontine réelle »

Branche `claude/continue-previous-a102rx` · 13 octobre 2026 · harnais `claude-code`.

## En une phrase

KÓMBE n'est plus un registre de laboratoire : une tontine ou une association
camerounaise peut s'y créer, inviter par WhatsApp, admettre, nommer son
bureau, accepter ses statuts, tenir ses séances (même sans réseau), déclarer
et confirmer ses versements (espèces, Orange Money, MTN MoMo, banque,
diaspora), remettre la cagnotte devant témoins, suivre ses dettes, amendes et
secours, voter ses décisions et reprendre son vieux cahier — sur la PWA, sur
l'application mobile et dans l'Espace bureau, tout cela vérifié contre une
vraie PostgreSQL. **KÓMBE ne garde jamais l'argent.**

## Ce qui est livré

| Domaine | Livré | Où le voir |
|---|---|---|
| Parcours de bout en bout | création → invitation → admission → bureau → statuts → démarrage → déclarations → confirmations → remise devant témoins → « j'ai bien reçu » → clôture | `docs/PARCOURS_UTILISATEURS.md`, E2E `tontine.spec.ts` |
| Réalités du terrain | téléphone d'abord (+237), membre sans smartphone représenté, paiement pour autrui, diaspora (transfert international), parts multiples et **demi-main**, tirage vérifiable, échange et **tour prioritaire**, remise réduite / avance / dette, avaliseur, secours, amendes et **graduation des sanctions**, **pause, destitution, exclusion, suspension, reprise de place votées**, séance **sans réseau**, PV imprimable, **reprise du cahier**, FR / EN / **pidgin (bêta)** | PWA, Espace bureau, mobile |
| Tableaux de bord | Espace bureau (9 pages, CSV, PV, votes & sanctions), Opérations, Direction, Engineering — tous sur données réelles, consoles plateforme réservées aux opérateurs | `/bureau/`, `/ops/`, `/direction/`, `/engineering/` |
| Mobile Flutter | branché sur l'API (connexion téléphone, tontines, déclarations Orange/MTN/diaspora, confirmations, votes, notifications, statuts) | `packages/mobile` |
| Déploiement | un seul projet Vercel (API + PWA + 4 tableaux de bord), migrations au build, smoke de mise en ligne | `docs/deployment/MORNING_SETUP.md` |
| Cycles et repères (ADR-0039) | cycles successifs (tours N+1…), réserve de fin d'année rendue à chacun, suppléance quand le trésorier ou le commissaire unique est concerné, simulateur avant création, « mon tour », régularité, résumé de séance pour WhatsApp | PWA (Aperçu, Séances, Création), `tontineCycles.proof.mjs`, E2E `cycles.spec.ts` |
| Contrat | OpenAPI vérifié contre le runtime dans les deux sens (84 routes produit) | `contractRuntime.test.ts` |
| Schéma | migrations 0026 → **0031** (up/down, RLS, dictionnaire, scénarios d'isolation) | `packages/db/DICTIONNAIRE.md` |

## Vérifications exécutées (aucun PASS simulé)

| Vérification | Résultat |
|---|---|
| `pnpm -r run typecheck` | vert |
| `pnpm -r run build` | vert |
| `pnpm -r run test` | domaine 428 · API 244 · dashboard-core 33 · client 23 · Espace bureau 3 · Opérations 4 · Direction 3 · Engineering 1 — tous PASS |
| `scripts/proofs-local.sh` (PostgreSQL 16 réel, base fraîche par preuve) | 20 / 20 PASS, dont `tontineApi.proof.mjs` (44), `decisions.proof.mjs` (55) et `tontineCycles.proof.mjs` (45 vérifications) ; isolation `C30_DECISION` PASS |
| Playwright / Chromium contre l'API réelle | 6 / 6 PASS : tour complet à 3, votes + cahier, séance sans réseau, bandeau hors connexion, accessibilité clavier, cycle complet puis cycle 2 |
| Espace bureau piloté dans Chromium (même origine) | toutes les pages, dont « Votes & sanctions » |
| `flutter analyze` / `flutter test` | 0 erreur, 0 avertissement / 51 PASS (goldens compris) |
| Garde de copie (épargne, solde, retrait, débité, sécurisé, garanti, chiffré, « validé par le serveur »…) | PASS sur PWA (FR/EN/pidgin), mobile, tableaux de bord, site |

## Défauts trouvés et corrigés en route (section 6)

- Remise d'un tour **complet** refusée quand l'association n'a pas de caisse de fonctionnement.
- Échange de tours d'un cycle par parts : **409** à l'approbation (unicité « une part, un tour »).
- Écran effacé quand le réseau tombe juste après une action.
- Langue oubliée à chaque ouverture.
- Mobile : chaîne de requête encodée dans le chemin (`/me/dues%3FgroupId=…`).
- CORS sans `allow-credentials` (navigateur bloqué), CSP de l'API qui bloquait la PWA servie en même origine, démarrage en échec sans fournisseur SMS.

## ADR

ADR-0025 à **0038** (index : `docs/adr/0000_index.md`). Nouvelles décisions
de cette passe : **ADR-0038** — décisions votées à la majorité absolue des
électeurs, délai de défense de 72 h, vote secret, exécution serveur, reprise
de place, part partagée.

## Drapeaux fermés (jamais activés)

Prêts internes (`loan_register`), enchères (`auction`), collecte par tontinier
(`daily_collector`) : implémentés au domaine, **fermés**, ouverture seulement
après avis juridique (ADR-0032).

## Reste à faire par le porteur

Voir `docs/BLOCAGES_TONTINE_REELLE.md` : créer le projet Vercel et coller 4
variables (≈ 15 min), compte SMS Africa's Talking, domaine e-mail Resend,
signature Android, double authentification des opérateurs avant ouverture
large, exercice de restauration, relecture du pidgin, et confirmation des
choix par défaut (ADR-0034, ADR-0038).

## Mise en ligne demain matin

1. Fusionner la pull request de cette branche vers `master`.
2. Suivre `docs/deployment/MORNING_SETUP.md` (créer le projet Vercel, coller les variables, **Deploy**).
3. `KOMBE_SMOKE_BASE_URL=https://<projet>.vercel.app node scripts/release-smoke.mjs` → `SMOKE_PASS`.
