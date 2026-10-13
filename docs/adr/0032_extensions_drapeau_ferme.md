# ADR-0032 — Extensions sous drapeau fermé : enchères, prêts internes, collecte par tontinier

- **Statut :** **PROPOSÉ** — aucune activation sans décision écrite du porteur.
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Ces pratiques existent sur le terrain mais portent un risque (qualification d'activité de crédit ou de collecte de fonds au sens COBAC/CEMAC, conflits).

## Décision

- Enchères, registre des prêts internes (« frais de participation », jamais « intérêt ») et collecte journalière par un tontinier : tables et règles de domaine présentes, **drapeaux fermés** par défaut (`FLAGGED_FUND_KINDS`), aucune route d'écriture ouverte.
- Le tontinier, et non KÓMBE, détient l'argent : à afficher explicitement le jour où le drapeau s'ouvre.
- Risque réglementaire COBAC/CEMAC à faire analyser par un juriste avant toute activation.

## Conséquences

Ouverture : décision écrite du porteur + nouvelle ADR adoptée + revue juridique.
