# ADR-0010 — Porte G-CONSTRUCTION et statut des preuves base-réelle

- **Statut :** ADOPTÉ (C00). Décision de porte : **BLOCKED explicite** (documentée).
- **Auteur :** Lead technique C00 • **Date :** 2026-09-27
- **Contexte / origine :** `H00_PROMPT.md` ; `04_Harness/` (run_h00.py, reference_oracles.py,
  verify_gate.py) ; `00_PROMPT_MAITRE` — « le succès du harnais Python de référence ne
  franchit **pas, à lui seul**, la porte » ; règle « jamais un succès simulé ».

## Décision
- La porte **G-CONSTRUCTION** est évaluée par le harnais H00 (20 cas H01–H20). Le
  rapport versionné `harness/reports/RAPPORT_G_CONSTRUCTION.json` porte le **SHA du
  commit** testé et un statut global.
- **Le harnais de référence ne suffit pas** à accepter la porte : H01 (mode fabrication
  détecté) et H02 (SHA du runner) ne prouvent pas l'isolation ni les verrous. L'acceptation
  exige des preuves **base réelle** et **CI protégée** non disponibles sur cet hôte.
- Sur cet hôte (**aucun Docker, aucune PostgreSQL, aucun remote/CI**), l'état est :
  **11 PASS / 0 FAIL / 9 BLOCKED**. Les cas `BLOCKED` — H03, H06, H07, H09, H10, H13,
  H14, H18, H20 — sont **explicitement** des limites d'environnement (voir §Limites),
  **jamais** des succès simulés.
- **Décision de porte C00 : `BLOCKED` assumé et documenté.** Cet état autorise la
  **construction encadrée du socle** (C00 → contrats + domaine pur testé) mais
  **n'autorise ni pilote réel, ni release**. Le passage à `ACCEPTED` requiert :
  Docker + PostgreSQL 16+ (Testcontainers) pour H07/H18, et GitHub Actions avec jobs
  séparés + env allowlist + restrictions réseau + protection de branches pour
  H03/H06/H09/H10/H13/H14/H20 (lot C28).
- La **recette C00** (`pnpm run recette:c00` : build tsc + 42 tests domain dont
  recroisement oracle + 11 tests api) est une **preuve reproductible** du socle,
  **indépendante** du statut de porte ; elle ne prétend pas fermer G-CONSTRUCTION.

## Alternatives rejetées
- Déclarer la porte `ACCEPTED` sur la seule verdeur des tests unitaires — interdit par
  le maître prompt (confondrait « socle construit » et « isolation/verrous prouvés »).
- Simuler les résultats DB/CI pour afficher PASS — violerait « jamais un succès simulé ».
- Bloquer toute construction en attendant l'infra — rejeté : les contrats et le domaine
  pur sont vérifiables maintenant et sans dépendance externe.

## Conséquences
- Les ADR-0004/0006/0007 renvoient leurs preuves **base réelle** en **C01** ; ce lot
  livrera contrat + tests en statut `BLOCKED` tant que PostgreSQL est absent.
- Le rapport H00 est **régénéré au SHA réel** du commit C00 à chaque promotion ; un
  rapport dont le `commit` ne correspond pas au SHA vérifié est **rejeté** (H04/H05).
- Fournisseurs/CI restent `[OUVERT-D01..D10]` ; aucune dépendance payante activée ici.
