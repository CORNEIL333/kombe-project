# ADR-0033 — Un seul client web (PWA React), Flutter pour Android/iOS, un seul logo

- **Statut :** **PROPOSÉ, appliqué par défaut** — résout I-16 ; précise ADR-0020.
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Deux clients web coexistaient (PWA React `packages/client` et Flutter web) et trois logos (anneau, « K + 3 orbes », « trois personnes »). Le build Flutter web n'a jamais pu être exécuté sur l'hôte de construction.

## Décision

- Le client web est la **PWA React** (`packages/client`), branchée sur l'API tontine, testée de bout en bout (Playwright).
- Flutter (`packages/mobile`) cible Android et iOS.
- Un seul symbole : l'anneau de la direction « L'Orbite » v2 ; signature « Votre tontine, plus claire. ».

## Conséquences

La PWA est le chemin le plus court vers les membres (lien WhatsApp → navigateur), sans store.
