# Vérification du matériel livré

**Révision 2.0 : statut du socle.** Les scripts existants restent inchangés. Les renforcements [HC01–HC07](RENFORCEMENT_HARNESS.md) et [20 cas H00](RECETTE_ASSURANCE_CONSTRUCTION.md) sont spécifiés, non implémentés. Un PASS du contrôleur mécanique historique ne suffit plus pour accepter G0. Les résultats applicatifs restent bloqués tant que le produit et son adaptateur ne sont pas raccordés.

Exécution locale du 15 septembre 2026.

| Contrôle | Résultat réel |
|---|---|
| Oracles montant, réservation, quorum, dates, rapprochement, CSV et empreinte | 28 auto-tests PASS |
| Contrôleur d'assertions avec montant volontairement erroné | Écart détecté dans auto-test |
| Adaptateur applicatif non configuré | 63 scénarios G0 BLOCKED ; sortie 2 attendue |
| Gate avec manifeste non renseigné | BLOCKED ; sortie 2 attendue |
| Dépôt et application KÓMBE | Non fournis ; aucun test applicatif exécuté |

Le rapport JSON conserve les commandes et sorties. Les fixtures et oracles sont un matériel de construction ; ils ne prouvent pas la sécurité, la conformité, la performance ni la restauration du futur logiciel. Les tests de contrats, DB réelle, UI, charge, fournisseurs et ASVS doivent être réalisés par C28 sur le dépôt cible.
