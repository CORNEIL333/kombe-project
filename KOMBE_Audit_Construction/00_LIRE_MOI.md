# KÓMBE — Dossier de construction par agents IA

Version documentaire 2.0 • 17 septembre 2026 • Porteur du projet et équipe de réalisation

**Décision confirmée par le porteur : construire KÓMBE à zéro avec des agents IA et des harness.** La documentation métier et les identifiants du backlog sont conservés. L'absence de code dans l'archive initiale n'est plus une question de réutilisation à arbitrer : elle définit le point de départ.

La construction et les essais commencent sur données fictives. L'ouverture à des données réelles exige G0. La cible recommandée reste un registre de tontines fermées en XAF sans détention ni transfert du pot au pilote ; les arbitrages métier détaillés restent à adopter explicitement.

## Parcours de lecture

1. Lire [les décisions et la portée de la révision](DECISIONS_ET_VERSION.md), puis la synthèse `SYNTHESE_DIRECTION.docx`.
2. Lire [les zones noires et grises](01_Audit/ZONES_NOIRES_ET_GRISES.md) et [les risques de construction par agents](01_Audit/RISQUES_AGENTS_IA.md).
3. Choisir les versions et profils à partir de [la méthode de construction](07_Construction_IA/METHODE_ET_GOUVERNANCE.md) et du [catalogue des dépôts](07_Construction_IA/DEPOTS_ET_SKILLS.md).
4. Exécuter le [prompt maître](03_Prompts/00_PROMPT_MAITRE.md) : C00 prépare le squelette ; H00 construit et éprouve la chaîne de validation ; puis C01 à C29 réalisent le produit selon leurs dépendances. Ne pas démarrer trente agents simultanément.
5. Utiliser [les exigences de renforcement du harness](04_Harness/RENFORCEMENT_HARNESS.md) et les 20 cas d'assurance H00. Ces cas sont distincts des 90 scénarios de recette applicative.
6. Suivre le [plan global de déploiement](05_Deploiement/PLAN_GLOBAL_DEPLOIEMENT.md). G0 doit inclure les preuves de la chaîne de validation, pas seulement les résultats applicatifs.

## Contenu et statut

- 22 constats d'audit initial réinterprétés pour une construction neuve ; 8 zones noires, 12 zones grises et 18 risques de construction par IA.
- 32 prompts : un maître, 30 composants C00–C29 et le lot préalable H00. Les 130 entrées du backlog gardent leur couverture.
- 71 technologies, services ou méthodes recensés ; trois alternatives par entrée, soit 213 positions d'alternatives contextualisées. Certaines alternatives exigent un autre langage ou un changement de méthode et ne sont pas interchangeables.
- 90 scénarios applicatifs dont 63 G0 ; 20 scénarios supplémentaires d'assurance de la construction, spécifiés et non exécutés.
- Six cahiers de conception de skills KÓMBE. Ce sont des spécifications à implémenter et tester, pas des plugins installés.
- Synthèse Word, documents Markdown éditables, matrices JSON et dossier HTML navigable.

## Limites à conserver dans toute communication

L'audit initial porte sur 12 fichiers documentaires. Aucun logiciel KÓMBE, environnement fournisseur ou preuve de conformité opérationnelle n'est audité ici. Les scripts Python livrés constituent un socle pédagogique et de recette : les nouvelles barrières d'isolation, d'identité, de provenance et de CI protégée sont à construire par H00/C28. Les tests de référence ne prouvent pas la sécurité du futur logiciel.

Les sources originales sous `06_Sources/Documentation_entree/` sont préservées. La révision prévaut sur leurs phrases historiques relatives au MVP, sans les réécrire. Les recommandations Spec Kit/ECC/Trail of Bits ont été étudiées le 16 septembre ; leur combinaison n'a pas été installée ni éprouvée. Les recherches fournisseurs du 15 septembre conservent leur date et doivent être revérifiées avant engagement.

L'alignement international reste un programme de preuves, sans certification ISO, attestation SOC 2 ou autorisation de paiement attribuée. Aucun compte, achat, déploiement ou message réel n'a été effectué.
