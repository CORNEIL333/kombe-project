# Dépôts Git et sélection de skills

Recherche principale le 16 septembre 2026 ; consolidation le 17 septembre. Les README et pages officielles ont été consultés ; aucune installation ni audit de sécurité complet des dépôts n’a été effectué. Le dépôt ancien `affaan-m/everything-claude-code` redirige vers `affaan-m/ECC`. Les versions/commits installés restent à renseigner dans C00.

## Choix proposé

| Dépôt | Rôle proposé | Décision |
|---|---|---|
| [github/spec-kit](https://github.com/github/spec-kit) | Constitution, spécifications, plans, tâches, convergence | Méthode principale recommandée |
| [affaan-m/ECC](https://github.com/affaan-m/ECC) | Bibliothèque de skills, agents, règles et hooks | Sélection ciblée, non installation globale |
| [trailofbits/skills](https://github.com/trailofbits/skills) | Revue sécurité et qualité des tests | Complément ciblé |
| [obra/superpowers](https://github.com/obra/superpowers) | TDD, diagnostic et vérification | Alternative d’exécution ou skills explicitement adaptés |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | Spécifications par changement | Alternative à Spec Kit |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | Méthode produit/architecture/développement | Alternative globale, non cumul par défaut |

Les pages de versions de [Spec Kit](https://github.com/github/spec-kit/releases), [ECC](https://github.com/affaan-m/ECC/releases) et [Superpowers](https://github.com/obra/superpowers/releases) ont été consultées. L’existence d’une activité publique ne prouve pas la fiabilité d’une version précise ; noter le commit et réévaluer les modifications de hooks avant adoption. Aucun classement par nombre d’étoiles n’est utilisé.

## Sélection initiale

| Source | Composant annoncé dans le catalogue | Usage KÓMBE | Vérification avant activation |
|---|---|---|---|
| ECC | tdd-workflow | Cycle test défaillant, code, vérification | Ne pas altérer attentes critiques |
| ECC | verification-loop | Vérification à chaque lot | Rapports liés au vrai build |
| ECC | security-review | Revue de sécurité | Vérifier faits et retests |
| ECC | code-reviewer, agent | Relecture des modifications | Droits distincts, aucun pouvoir de release |
| Trail of Bits | property-based-testing | Invariants métier | Générateur et oracle distincts |
| Trail of Bits | mutation-testing | Détecter tests trop faibles | Couverture des mutants critiques |
| Trail of Bits | spec-to-code-compliance | Concordance aux contrats | Version adoptée de la spécification |
| Trail of Bits | post-patch-validation | Recherche de variantes et régressions | Reproduction de l’échec original |
| Superpowers | systematic-debugging | Alternative de diagnostic | Compatible avec le workflow principal |
| Superpowers | verification-before-completion | Alternative de clôture | Preuves indépendantes de l’affirmation IA |

Les chemins et syntaxes sont à vérifier à la révision retenue. Les noms de commandes et les mécanismes de hooks diffèrent selon l’outil hôte. Aucun skill ne doit augmenter les permissions d’un agent ; ses instructions sont soumises aux règles du projet et aux contrôles de la plateforme.

## Contrôles exécutables

[fast-check](https://github.com/dubzzz/fast-check) : propriétés et graines. [StrykerJS](https://github.com/stryker-mutator/stryker-js) : mutations. [Testcontainers Node](https://github.com/testcontainers/testcontainers-node) : PostgreSQL temporaire réel. [Playwright](https://github.com/microsoft/playwright) : parcours navigateurs. [Gitleaks](https://github.com/gitleaks/gitleaks) : secrets. [Trivy](https://github.com/aquasecurity/trivy) : vulnérabilités et configurations. Semgrep, ZAP et axe-core restent dans le catalogue initial pour compléter les contrôles.

Les trois derniers outils cités dans le premier échange ne sont pas ajoutés en doublon : Playwright = TEC48, Trivy = TEC52, Gitleaks = TEC53. Chaque entrée dispose de trois alternatives dans le registre, qui contient également les coûts de changement de stack.

## Essai de compatibilité à exécuter dans H00

Choisir un outil hôte et sa version ; lister les extensions activées et les permissions ; installer le minimum dans un espace fictif ; demander un changement anodin ; observer fichiers modifiés, commandes et accès ; provoquer un échec de test ; vérifier qu’aucune règle critique n’est assouplie ; désactiver un composant et démontrer le retour arrière. Répéter après chaque mise à jour de hook ou du mécanisme d’exécution. La simple présence d’un dossier de skills ne démontre pas son chargement ni son respect.
