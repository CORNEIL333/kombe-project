# ADR-0028 — Séance, collecte en lot, remise devant témoins, procès-verbal

- **Statut :** **PROPOSÉ, appliqué par défaut**.
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

La tontine se vit en séance : appel, cotisations remises au trésorier, remise de la cagnotte devant tout le monde, procès-verbal lu à la séance suivante.

## Décision

- Séance : prévue → ouverte → close (ou annulée avec motif), ouverte et close par Président, Vice-président ou Secrétaire.
- Appel : présent, en retard, absent excusé, absent, représenté (représentant tracé).
- Collecte : chaque cotisation garde sa propre déclaration ; le trésorier **confirme en lot** ; il ne confirme jamais sa propre déclaration (la présidence confirme ses versements) ; le commissaire aux comptes valide.
- Remise en espèces : seulement en séance ouverte, devant des témoins notés présents (nombre fixé au règlement, 2 par défaut) ; le bénéficiaire confirme la réception ; le tour ne se clôt qu'après.
- PV généré depuis les événements, empreinte SHA-256, approuvé à la séance suivante, imprimable (PDF via l'impression du téléphone).

## Conséquences

Le mode séance hors connexion (actes préparés sur l'appareil, soumis au retour du réseau) reste à livrer : rien n'est montré comme confirmé avant la réponse du serveur.
