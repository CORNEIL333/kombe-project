# Risques de construction par agents IA

Version 2.0 — analyse de conception, sans exploitation reproduite sur un logiciel KÓMBE. P0 : contrôle exigé avant toute donnée réelle ; les barrières d’accès des agents sont à établir dès H00. P1 : maîtrise de livraison avant extension ; ne jamais ignorer un risque d’intégrité parce que son mécanisme est organisationnel.

| ID | Niveau | Risque | Exemple | Contrôle prescrit | Cas H00 | Responsable |
|---|---|---|---|---|---|---|
| RA01 | P0 | Erreur commune au code et à son test | L’agent encode un quorum faux et reproduit la même formule dans le test. | Exemples métier adoptés et oracle séparé. | H01 H08 | Produit/QA |
| RA02 | P0 | Modification des attentes | Un test gênant est désactivé pour faire passer le lot. | Suite critique et exclusions protégées par revue distincte. | H02 H11 | Lead/QA |
| RA03 | P0 | Observations fabriquées | Un adaptateur retourne des constantes au lieu de lire la DB. | Exécution indépendante, fixtures variables et traces vérifiables. | H01 H07 | QA |
| RA04 | P0 | Mauvaise version testée | Le rapport reprend un SHA fourni sans lien avec le binaire. | Lien commit/build/artefact contrôlé par CI de confiance. | H04 H05 | Exploitation |
| RA05 | P0 | Fausse identité de revue | Deux chaînes de caractères prétendent représenter deux approbateurs. | Identités authentifiées et droits séparés ; attestation validée. | H06 | Direction/CI |
| RA06 | P0 | Fuite de secrets et réseau | L’agent ou un script lit des variables sensibles et les envoie. | Aucun secret prod, liste blanche des variables et sorties réseau limitées. | H09 H10 | Sécurité |
| RA07 | P0 | Injection par contenu externe | Un README ou résultat outil demande de changer la CI. | Contenus externes non fiables, permissions hors modèle, revue des outils. | H12 | Sécurité |
| RA08 | P0 | Dépendance ou hook compromis | Un paquet ou skill exécute une commande inattendue. | Provenance, pinning, examen des scripts, installation isolée. | H13 | Lead |
| RA09 | P1 | Conflits entre agents | Deux migrations et contrats incompatibles sont fusionnés. | Propriétaire du schéma, branches courtes, intégration sérialisée des migrations. | H14 | Lead |
| RA10 | P1 | Contexte périmé | Un agent suit un ancien état des règles. | Version explicite des ADR et contrôle de compatibilité avant fusion. | H15 | Produit |
| RA11 | P0 | Mocks à la place de la DB | Le test prétend prouver un verrou PostgreSQL avec un objet mémoire. | DB réelle et requêtes concurrentes synchronisées. | H07 | Backend/QA |
| RA12 | P0 | Tests faibles | Retirer un contrôle d’autorisation ne fait échouer aucun test. | Mutants critiques semés et cas négatifs indépendants. | H08 | QA |
| RA13 | P1 | Flakiness masquée | Des relances automatiques cachent une course intermittente. | Conserver première erreur, graine et rapports ; correction avant passage. | H16 | QA |
| RA14 | P1 | Coûts ou boucles sans fin | Une tâche relance la génération sans nouvelle preuve. | Budget par tâche, essais bornés et arrêt diagnostiqué. | H17 | Lead/finance |
| RA15 | P0 | Migration ou restauration destructrice | Le retour arrière perd des opérations déjà acceptées. | Expand/contract et restauration avec rapprochement, données fictives en essai. | H18 | Exploitation |
| RA16 | P0 | Actions réelles pendant recette | Email, frais ou transfert déclenchés depuis les tests. | Fournisseurs simulés/sandbox, aucun credential réel et egress limité. | H19 | Exploitation |
| RA17 | P0 | Rapport périmé réutilisé | Un PASS précédent autorise un nouvel artefact. | Attestation liée au run, artefact, suite et environnement attendus. | H05 | CI |
| RA18 | P0 | Contrôleur modifiable par le candidat | Une PR change le workflow qui décide de son succès. | Contrôleur versionné depuis une source approuvée ; environnement d’évaluation séparé. | H02 H20 | Sécurité/CI |

## Risque résiduel

Deux agents différents peuvent partager la même erreur. Changer de modèle améliore parfois la diversité de revue mais ne constitue pas une indépendance de preuve. Les responsables métier adoptent les règles ; le contrôleur vérifie des faits ; les personnes autorisées assument les décisions de mise en service.

Un hook, un prompt ou un fichier de règles n’est pas une barrière de sécurité. L’isolation se met en œuvre par les droits du système, l’environnement d’exécution, le réseau, les comptes et les protections du dépôt. Un conteneur ayant accès au socket Docker de l’hôte ou à des secrets puissants ne satisfait pas cet objectif.

Références : [OWASP AI Agent Security](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html), [sécurité des workflows GitHub](https://docs.github.com/en/actions/reference/security/secure-use), [NIST SSDF](https://csrc.nist.gov/pubs/sp/800/218/final). Consultées le 16 septembre 2026.
