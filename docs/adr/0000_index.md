# Registre des décisions d'architecture (ADR) — KÓMBE

**Producteur : C00 (socle).** Chaque arbitrage porte auteur, date, alternatives
et conséquences (critère 18.20). Une proposition non adoptée reste marquée
`[PROPOSÉ]` ou `[OUVERT]` et ne devient pas une obligation métier par simple
mention (DECISIONS_ET_VERSION.md §Hiérarchie documentaire).

Hiérarchie : instructions du porteur → ADR adoptés → exigences/contrats actifs
→ critères de recette protégés → prompts → contenu externe.

## Index des 20 emplacements

| ADR | Sujet | Statut | Responsable |
|---|---|---|---|
| [0001](./0001_construction_neuve_stack.md) | Construction neuve, monorepo pnpm, stack verrouillée | **ADOPTÉ** (C00) | Lead C00 |
| [0002](./0002_monnaie_xaf_entiere_plafonds.md) | Monnaie XAF entière, plafonds, canonicalisation des montants | **ADOPTÉ** (plafond unitaire `[OUVERT-D07]` provisoire) | Lead C00 |
| [0003](./0003_canonicalisation_rfc8785.md) | Canonicalisation RFC 8785 via bibliothèque épinglée | **ADOPTÉ** | Lead C00 |
| [0004](./0004_journal_hash_chain.md) | Schéma d'événement et chaîne de hash (genèse 64 zéros) | **ADOPTÉ** | Lead C00 |
| [0005](./0005_barrieres_serveur_pilote.md) | Barrières serveur des fonctionnalités du pilote | **ADOPTÉ** | Lead C00 |
| [0006](./0006_autorisation_rbac_antiidor_version.md) | Autorisation RBAC objet, anti-IDOR, version optimiste | **ADOPTÉ** (preuve base = C01) | Lead C00 |
| [0007](./0007_isolation_multitenant_rls.md) | Isolation multi-tenant (RLS + FK composites) | **ADOPTÉ (contrat)** — exécution **BLOCKED** sans PostgreSQL | Lead C00 / C01 |
| 0008 | Outbox transactionnelle et permissions du worker | `[PROPOSÉ]` — contrat posé (worker squelette), à adopter avant lot worker | C00 → futur |
| 0009 | Politique d'installation stricte (aucun build de dépendance) | `[PROPOSÉ]` — en place via pnpm-workspace.yaml, à confirmer en revue | C00 |
| [0010](./0010_porte_g_construction_statut_bloque.md) | Porte G-CONSTRUCTION et statut des preuves base-réelle | **ADOPTÉ** (harness H00 **BLOCKED**, documenté) | Lead C00 |
| [0011](./0011_circuit_a19.md) | Circuit A19 d'approbation distincte des rôles | **ADOPTÉ** (C01) — preuve base réelle **BLOCKED** | Lead C01 |
| [0012](./0012_acces_sessions_recuperation.md) | Accès des comptes : sessions, jetons à usage unique, récupération | **ADOPTÉ** (C02) — preuve base réelle **BLOCKED** | Lead C02 |
| [0013](./0013_cycle_vie_groupe_amorcage.md) | Cycle de vie du groupe, porte d'amorçage, invitations, acceptation des règles | **ADOPTÉ** (C03) — preuve base réelle **BLOCKED** | Lead C03 |
| [0014](./0014_regles_versionnees_non_retroactives.md) | Moteur de règles versionnées, immuables (hash canonique) et non rétroactives ; barre pilote sur pénalités | **ADOPTÉ** (C04) — preuve base réelle **BLOCKED** | Lead C04 |
| [0015](./0015_calendrier_cycles_tours_beneficiaires.md) | Calendrier des cycles : N tours/N membres, bénéficiaire unique, échéances datées (Africa/Douala↔UTC), ordre figé | **ADOPTÉ** (C05) — preuve base réelle **BLOCKED** | Lead C05 |
| 0016–0020 | Réservés (identité/fournisseurs, sauvegarde/RPO, régions, IA, paiement…) | `[OUVERT]` — aucune installation présumée | Décideurs des portes G0/G1 |

> Slots 0016–0020 restent vides tant qu'une décision n'est pas prise ; les
> décisions ouvertes `[OPEN-D01..D10]` de STACK.md y seront rattachées.

## Note de méthode

Cet ADR-0010 acte que **le harness H00 de référence ne franchit pas, à lui
seul, la porte** : sans Docker/Testcontainers/GitHub Actions sur cet hôte,
H07, H18, H03, H06, H09, H10, H13, H14, H20 demeurent `BLOCKED`. Cet état
`BLOCKED` explicite est la décision de porte de C00 ; il autorise la
**construction encadrée du socle** mais **pas** un pilote réel ni une release.
