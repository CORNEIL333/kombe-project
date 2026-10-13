# ADR-0029 — Caisses multiples, amendes en caisse séparée, caisse de secours

- **Statut :** **PROPOSÉ, appliqué par défaut** — remplace la barre « aucune pénalité » d'ADR-0014 pour la caisse des amendes (la cotisation n'est jamais modifiée par une amende).
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Une association tient plusieurs caisses : cagnotte (njangi), secours, fonctionnement, réserve de fin d'année, amendes.

## Décision

- Objet `fund` par groupe : `rotation`, `solidarity`, `year_end_reserve`, `operating`, `fines`, `loan` et `collector` (ces deux derniers sous drapeau fermé, ADR-0032).
- Totaux confirmés par caisse = argent **tenu par le trésorier**, jamais par KÓMBE ; affichés séparément.
- Amendes : barème accepté au règlement (retard fixe ou par jour après la grâce, retard/absence en séance, indiscipline plafonnée), constatées par Censeur/Président/VP, contestables par le membre, maintenues ou annulées par la présidence (≠ membre concerné), payées dans la caisse des amendes.
- Secours : barème par événement (décès membre/conjoint/parent/enfant, naissance, mariage, maladie), plafond annuel, demande par le membre ou un proche, décision du bureau (≠ bénéficiaire), remise déclarée ; pièces justificatives non exigées.

## Conséquences

Graduation (avertissement → amende → suspension → exclusion par vote) : étapes de domaine prêtes (`SANCTION_STEPS`), parcours à brancher.
