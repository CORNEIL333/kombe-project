# Registre des décisions d'architecture (ADR) — KÓMBE

**Producteur : C00 (socle).** Chaque arbitrage porte auteur, date, alternatives
et conséquences (critère 18.20). Une proposition non adoptée reste marquée
`[PROPOSÉ]` ou `[OUVERT]` et ne devient pas une obligation métier par simple
mention (DECISIONS_ET_VERSION.md §Hiérarchie documentaire).

Hiérarchie : instructions du porteur → ADR adoptés → exigences/contrats actifs
→ critères de recette protégés → prompts → contenu externe.

## Index des 21 emplacements

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
| [0016](./0016_journal_evenements_projections_integrite.md) | Journal d'événements : append-only réel, replay versionné des totaux, checkpoints hors privilèges app, timeline filtrée | **ADOPTÉ** (C11) — preuve base réelle **BLOCKED** | Lead C11 |
| [0017](./0017_idempotence_registre_capacite_sous_verrou.md) | Déclarations partielles et idempotence : registre durable (scope acteur/groupe/type/clé + hash de corps), rejeu/conflit 409, droits relus avant rejeu, capacité sous verrou, excédent bloqué | **ADOPTÉ** (C06) — preuve base réelle **BLOCKED** | Lead C06 |
| [0018](./0018_validations_corrections_independance_compensation.md) | Validations et corrections de cotisations : machine à états, indépendance/anti-cumul (déclarant≠confirmateur, un acte par acteur), confirmation atomique vs seuil, compensation unique liée, fenêtre de contestation (ordinaire 7 j, fraude/erreur grave exemptes), gel des dépendances | **ADOPTÉ** (C07) — preuve base réelle **BLOCKED** | Lead C07 |
| [0019](./0019_litiges_recours_independance_resolution_sans_montant.md) | Litiges et recours : dossier motif+correction, vue commune vs détail privé (non désactivable), indépendance du résolveur à la désignation (rôle ≠ indépendance, tous impliqués ⇒ gel + procédure externe), résolution **sans aucun montant** (correction via C07/C08), recours lié à l'original, gel de clôture ciblé, temps calendaire vs ouvré distincts | **ADOPTÉ** (C10) — preuve base réelle **BLOCKED** | Lead C10 |
| [0020](./0020_flutter_mobile_client.md) | Client mobile Flutter natif | **ADOPTÉ** (remplace `OPEN-D03`) | Décision humaine 2026-09-30 |
| [0021](./0021_fournisseur_postgres_neon.md) | Fournisseur PostgreSQL géré : Neon (projet `square-resonance-19892972`) | **ADOPTÉ** (remplace `OPEN-D02`) — `auth`/fonctions/bucket du scaffold hors-périmètre, voir l'ADR | Décision humaine 2026-10-03 |

> Correction d'index : 0020 était listé ci-dessus comme « réservé » avant
> l'adoption de l'ADR Flutter ; la ligne n'avait pas été mise à jour au moment
> du commit `ab6ce3d`. Corrigé ici.
>
> Slots restants (`OPEN-D06` identité, `OPEN-D09` sauvegarde, `OPEN-D10`
> région…) seront rattachés à de nouveaux numéros au fil des décisions.

## Note de méthode

Cet ADR-0010 acte que **le harness H00 de référence ne franchit pas, à lui
seul, la porte** : sans Docker/Testcontainers/GitHub Actions sur cet hôte,
H07, H18, H03, H06, H09, H10, H13, H14, H20 demeurent `BLOCKED`. Cet état
`BLOCKED` explicite est la décision de porte de C00 ; il autorise la
**construction encadrée du socle** mais **pas** un pilote réel ni une release.
