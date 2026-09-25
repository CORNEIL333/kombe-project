# Méthode et gouvernance de construction

## Architecture de travail recommandée

Un dépôt produit contient le code, la documentation adoptée et les tests de développement. Une zone d’assurance protégée contient les attentes critiques, le contrôleur et la politique de livraison. Cette zone peut être un dépôt séparé ou une référence protégée évaluée dans un environnement distinct ; sa séparation doit être effective, pas seulement un nom de dossier. Le code candidat ne reçoit aucun secret du contrôleur ni sa capacité de publier une approbation.

Le contrôleur provient d’une version approuvée ; le produit candidat est construit dans un environnement éphémère, sans credentials de production. Les artefacts circulent par identifiants/empreintes vérifiés. La recette s’exécute sur PostgreSQL réel avec données synthétiques. Les permissions et protections doivent fonctionner même si l’agent ignore toutes les instructions du prompt.

## Méthodes retenues comme recommandation

Spec Kit pilote constitution, spécifications, plan et tâches. ECC apporte uniquement les skills TDD, vérification et revue choisis. Trail of Bits complète la revue spécification/code et les tests de propriétés/mutation. Superpowers, OpenSpec et BMAD restent des alternatives ; ne pas charger plusieurs orchestrateurs globaux concurrents. Les commandes exactes dépendent des versions et de l’outil hôte : les documenter dans C00 après installation contrôlée, jamais les deviner depuis un ancien tutoriel.

## Responsabilités

| Fonction | Pouvoir | Limite |
|---|---|---|
| Produit humain | Adopte règles et exemples métier | Ne remplace pas les preuves techniques |
| Lead | Contrats partagés, migrations, versions | Ne fusionne pas seul sa modification critique |
| Agent constructeur | Produit code et tests locaux sur branche | Aucun accès prod ni modification autonome des critères protégés |
| Agent vérificateur | Cherche contre-exemples et variantes | Ses conclusions nécessitent faits et reproduction |
| QA et sécurité | Maintiennent contrôleur et suite critique | Séparation de la proposition et de l’approbation |
| CI de confiance | Produit builds, rapports et attestations | Ne charge pas sa politique depuis le code non approuvé |
| Exploitation | Promeut l’artefact accepté, pilote la reprise | Aucun rebuild différent entre recette et production |

Les rôles peuvent être exercés successivement dans une petite équipe. La séparation des droits et une revue humaine compétente des chemins critiques restent nécessaires. Aucun nombre arbitraire d’agents ne remplace ces responsabilités.

## Contrat de tâche remis à chaque agent

Identifiant du lot ; version des spécifications et ADR ; objectif ; périmètre de fichiers ; interfaces autorisées ; fixtures ; contraintes de sécurité ; tests attendus ; budget et délai d’exécution ; critères d’arrêt ; livrables et propriétaire de revue. Une ambiguïté financière bloque le point concerné, sans bloquer les tâches indépendantes déjà définies.

Proposition initiale de gestion : au maximum deux branches fonctionnelles concurrentes après stabilisation des interfaces ; une seule migration partagée en intégration ; trois tentatives de correction d’un même échec avant diagnostic et arbitrage. Ces valeurs sont des paramètres de départ à ajuster, pas des normes.

## Séquence et portes

1. C00 crée le dépôt neuf, les contrats, les commandes et les décisions de stack.
2. H00 construit la chaîne d’assurance avec un programme témoin fictif volontairement défectueux. Les premiers tests de sandbox/provenance peuvent ainsi être exécutés sans attendre tout KÓMBE.
3. G-CONSTRUCTION exige les 20 cas H00 exécutés et acceptés. Tout contrôle encore impossible reste BLOCKED ; un programme témoin ne vaut pas recette métier.
4. C01–C29 sont développés par incréments ; C28/C29 commencent tôt. L’interface suit les parcours verticaux ; les bases de droits et de journal précèdent les opérations.
5. Avant G0, rejouer l’assurance sur la configuration effectivement utilisée, exécuter les 63 cas applicatifs G0 et les tests ajoutés, fermer risques critiques, restaurer et faire examiner les preuves.
6. G1–G4 gardent leur sens métier. Une réussite technique n’autorise ni paiement du pot ni extension réglementée.

## Acceptation d’un lot

Les règles applicables sont reliées aux tests. Le build est reproductible dans l’environnement défini ; les scénarios interdits refusent l’action sans effet financier ; les tests de concurrence ont été réellement synchronisés ; aucune exclusion ou attente critique n’a changé sans revue ; les mutants critiques retenus sont détectés. Un mutant équivalent se justifie et se révise, il n’est pas compté silencieusement comme succès.

Les résultats gardent la première erreur, les graines, les versions et les logs expurgés. Les rapports produits par l’agent sont des propositions de preuves : la CI et les relecteurs doivent confirmer leur origine et leur contenu.

## Adoption et mise à jour des dépendances de construction

Consulter dépôt, licence, historique et instructions ; vérifier l’outil hôte ; figer version et commit ; examiner les hooks/scripts avant activation ; tester avec permissions minimales. Faire passer les mises à jour par une branche et une recette, sans `latest` automatique dans les workflows critiques. Toute mémoire automatique d’agent susceptible de modifier les règles adoptées reste désactivée ou soumise à promotion explicite.

Le budget inclut abonnements/API IA, minutes CI, stockage d’artefacts, scans et temps de revue. Les dépôts publics ne rendent pas l’exécution gratuite. Aucun coût exact ni réduction de délai n’est garanti ici.
