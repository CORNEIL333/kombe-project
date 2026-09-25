# Renforcement requis du harness

## État livré et décision

Le code Python de référence de la v1 est conservé sans modification. Il sépare les attentes du message envoyé à l’adaptateur, exige une cible applicative et bloque un adaptateur absent. Il ne constitue pas une frontière de confiance contre du code candidat capable de fabriquer les observations ou de modifier les fichiers voisins.

La présente v2 ajoute des exigences et des cas de recette ; elle ne prétend pas implémenter l’isolation, la provenance attestée ou une CI protégée. G-CONSTRUCTION reste NOT_RUN. La réussite des 28 auto-tests historiques est une preuve du socle de référence uniquement.

## Lacunes constatées par inspection

| ID | Fichier | Limite exacte | Travail H00/C28 |
|---|---|---|---|
| HC01 | run_harness.py | Faits acceptés depuis le JSON de l’adaptateur | Instrumentation indépendante et rapprochement de l’état réel |
| HC02 | run_harness.py | Retirer expected de stdin ne retire pas son fichier du disque partagé | Exécuter candidat et contrôleur dans espaces distincts |
| HC03 | run_harness.py | Commit transmis par argument, puis comparé à une déclaration | Lire identité de build depuis la chaîne CI vérifiée |
| HC04 | verify_gate.py | Deux noms différents ne démontrent pas deux personnes authentifiées | Vérifier identité, rôle et approbation depuis la plateforme de confiance |
| HC05 | verify_gate.py | Empreinte prouve cohérence des octets, pas origine ou sincérité | Attestations liées à un émetteur autorisé et au contexte attendu |
| HC06 | subprocess de run_harness.py | Variables du parent héritées ; pas de sandbox créée par ce script | Liste blanche env, accès disque et réseau restreints, ressources bornées |
| HC07 | ensemble du socle | Suite et scripts peuvent être changés avec les résultats si aucun contrôle externe | Politique et suite approuvées hors contrôle du candidat |

## Cible à implémenter

1. Résoudre la référence approuvée du contrôleur indépendamment de la branche candidate. Protéger règles de fusion, propriétaires et branches ; aucun compte d’agent constructeur ne peut les modifier.
2. Construire le candidat dans un job éphémère, à permissions minimales. Ne pas monter secrets prod, répertoire privé du contrôleur ou socket privilégié de l’hôte. Limiter mémoire, CPU, durée et sorties réseau.
3. Exécuter les fixtures variables depuis le contrôleur ; observer service/DB avec accès de contrôle distinct et limité. L’adaptateur fait l’action, il ne décide pas seul du verdict.
4. Produire un rapport depuis le contrôleur avec commit, digest de l’artefact, version du schéma, hash de la suite, version du contrôleur, identifiant de run, horodatage, environnement, graines, assertions et limites.
5. Publier les attestations avec une identité CI dédiée. Vérifier émetteur et workflow autorisés ainsi que le lien au digest attendu ; signer un faux rapport dans un job compromis ne rend pas celui-ci véridique.
6. Appliquer une décision indépendante : contexte attendu exact, scénarios complets, aucune erreur critique, revue authentifiée. Les règles de fraîcheur dépendent de la release et de sa configuration, pas d’une durée arbitraire seule.
7. Promouvoir le même artefact validé. Contrôler migrations et configuration appliquées ; les attestations de build ne prouvent pas que les secrets ou droits de production sont corrects.

## Qualité des tests

Pour chaque invariant financier et d’accès, définir exemples acceptés, contre-exemples et mutants critiques. fast-check génère les séquences ; StrykerJS aide à mesurer la sensibilité ; Testcontainers fournit PostgreSQL réel ; Playwright vérifie le parcours navigateur. Ces outils sont proposés, non installés. Les mocks sont réservés aux frontières externes ; les affirmations de transaction et d’isolation exigent la base réelle et des acteurs synchronisés.

Propriétés initiales : effet unique d’une commande ; total validé + réservations actives ≤ obligation ; déclarant distinct du confirmateur selon règle ; compensation unique ; aucune ligne d’un autre groupe ; utilisateur révoqué sans accès courant ; journal et projections rapprochables. Définir les cas légitimes et exclusions métier avant génération.

## Preuves supplémentaires avant G0

Rapport des 20 cas H00 ; configuration d’isolation ; provenance de build et vérification ; identités et permissions ; revue des hooks/skills ; rapport de mutations critiques ; restauration et rapport applicatif réel. Le script verify_gate.py actuel n’impose pas ces nouvelles pièces : C28 doit le remplacer ou l’intégrer dans un contrôle supérieur avant que G0 puisse être considéré accepté.

Un contournement découvert doit être enregistré comme défaut du contrôleur, puis testé après correction. Ne pas répondre par un simple renforcement du prompt si la permission technique reste excessive.
