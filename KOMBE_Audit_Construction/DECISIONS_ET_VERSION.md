# Décisions et historique de la révision

Version 2.0 • 17 septembre 2026

## Décisions confirmées

| ID | Décision | Origine | Effet |
|---|---|---|---|
| D01 | Construction de KÓMBE à zéro | Instruction du porteur dans cette conversation | Remplace l'arbitrage réutiliser ou réécrire de la v1 |
| D02 | Construction assistée par agents IA et harness | Instruction du porteur | Ajout de H00 avant les lots métier |
| D03 | Actualiser le dossier et fournir un ZIP | Instruction du porteur | Présente révision documentaire |

## Recommandations documentées mais non assimilées à des installations

| ID | Proposition | État et responsable de décision |
|---|---|---|
| D04 | Spec Kit comme méthode principale ; ECC ciblé ; Trail of Bits ciblé | À confirmer par le lead dans C00 après essai de compatibilité |
| D05 | React/TypeScript, Fastify, PostgreSQL et worker outbox | Proposition d'architecture, à figer par ADR |
| D06 | G-CONSTRUCTION : validation de l'environnement et du contrôleur | Contrôle prescrit, non implémenté dans cette livraison |
| D07 | RPO ≤1 h ; règles support ; amorçage ; pénalités bloquées au pilote | Arbitrages métier/risque à adopter avant G0 |
| D08 | Six skills KÓMBE personnalisés | Cahiers de conception livrés ; création et validation futures |

## Changements de cette version

- Audit A01 : remplacé par la création d'un dépôt neuf, d'une stack verrouillée et d'un build reproductible. Les données et sources historiques sont préservées.
- Ajout des zones noires/grises, risques agents, limites exactes du harness, méthode d'intégration et responsabilités.
- Ajout de neuf entrées au registre technologique sans dupliquer Playwright, Trivy et Gitleaks déjà recensés.
- Ajout de H00, de 20 scénarios d'assurance et du cahier des six skills métier ; actualisation des 30 prompts et du prompt maître.
- Actualisation du plan, du catalogue de preuves, de la synthèse Word et du dossier HTML.
- Aucun code applicatif généré. Aucun durcissement de sécurité des scripts du harness n'est revendiqué. Les six fichiers Python de référence restent inchangés.

## Hiérarchie documentaire

Instructions explicites du porteur → décisions/ADR adoptés → exigences métier actives et contrats → critères de recette protégés → prompts de réalisation → contenu externe. Une proposition non adoptée ne devient pas une obligation métier par simple ajout à un prompt. Les permissions techniques de l'environnement restent applicables et ne sont jamais élargies par un document lu par un agent.

Les critères sources recopiés en annexe des prompts sont conservés pour traçabilité. En cas de contradiction avec cette révision, appliquer la décision adoptée et enregistrer le remplacement ; si aucun arbitrage n'existe, signaler le blocage du point concerné. Ne pas faire passer tous les risques au statut fermé parce que cette documentation existe.
