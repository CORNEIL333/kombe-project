# ADR-0030 — Défaut, dette suivie, avance de caisse, avaliseur

- **Statut :** **PROPOSÉ, appliqué par défaut** — résout I-12 (un impayé ne bloque plus la remise).
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Un membre qui ne paie pas ne doit pas priver le bénéficiaire de son tour ; le groupe veut suivre la dette.

## Décision

- Politique au règlement : avance du fonds de caisse (défaut), remise réduite, ou attente.
- Avance : écriture tracée en sortie du fonds de caisse ET en entrée de la cagnotte ; la dette est due au fonds.
- À la clôture du tour, chaque part impayée devient une **dette suivie** (origine, reste, historique) qui sort des échéances ; règlement par une déclaration ordinaire citant la dette ; abandon par la présidence (≠ débiteur).
- Avaliseur exigible à l'adhésion (règlement) ; nommé sur la dette. Ordre de confiance : « les nouveaux reçoivent en dernier ».
- Montants individuels de dette visibles du bureau et de l'intéressé seulement.

## Conséquences

Reprise de place d'un membre sortant (rattrapage immédiat ou étalé) : calcul de domaine prêt (`CatchUpMode`), parcours à brancher.
