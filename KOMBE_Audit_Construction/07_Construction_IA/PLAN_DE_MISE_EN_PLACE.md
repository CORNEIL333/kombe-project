# Plan de mise en place de la construction assistée

Le planning ci-dessous est ordonné par livrables, sans promesse de durée ou réduction de coût liée à l’IA. C00 chiffre chaque étape avec le porteur. Les contrôles d’accès nécessaires aux agents sont établis avant leur première exécution autonome.

| Étape | Travail | Responsable | Sortie vérifiable |
|---|---|---|---|
| 1 | Adopter périmètre, invariants, rôles et exceptions | Produit/lead | ADR et exemples validés |
| 2 | Créer dépôt neuf, stack, scripts et références | C00 | Checkout reproductible et versions fixées |
| 3 | Évaluer profils Spec Kit/ECC/Trail of Bits | Lead/sécurité | Fiche d’adoption par outil et essai fictif |
| 4 | Construire H00 avec programme témoin | QA/CI | Isolation, contrôleur et preuves authentifiées |
| 5 | Exécuter les 20 cas d’assurance | QA/relecteur | G-CONSTRUCTION accepté ou BLOCKED explicite |
| 6 | Implémenter premier parcours vertical | Agents/lead | Groupe, cotisation, confirmation, correction, export |
| 7 | Tester propriétés, mutants, accès et concurrence | QA | Défauts critiques détectés, tests métier réels |
| 8 | Étendre C01–C29 selon dépendances | Équipe | Couverture des critères du backlog |
| 9 | Rejouer assurance et restaurer le produit | Exploitation/sécurité | Preuves G0 sur même artefact/configuration |
| 10 | Pilote contrôlé puis extensions | Produit/terrain | Mesures de terrain et décisions G1–G4 |

## Paquet remis à un agent constructeur

Prompt du lot + critères métier adoptés + contrats versionnés + limites de fichiers et outils + fixtures fictives + commandes autorisées + budget + critères d’arrêt + format de résultat. Les secrets, clés de signature et permissions de production ne font jamais partie de ce paquet.

## Décisions restant ouvertes

Outil hôte exact et plan ; versions de méthodes ; responsable de revue indépendant ; fournisseur de CI et capacité réelle à protéger les gates ; budget IA/CI ; objectifs de reprise ; règles support et données. Ces décisions doivent produire des preuves, pas des cases cochées par l’agent lui-même.
