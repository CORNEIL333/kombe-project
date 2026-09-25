# Cahiers de conception des six skills KÓMBE

Ces fiches définissent les futurs skills ; aucun `SKILL.md` installable n’est fourni ou activé. H00 doit les implémenter dans un dépôt versionné, tester leurs déclencheurs et vérifier leur comportement dans l’outil hôte. Une instruction de skill n’accorde aucun droit technique supplémentaire.

Le format de sortie commun comprend périmètre, sources versionnées, faits observés, actions exécutées, preuves, verdict et limites. L’auteur du skill et le relecteur enregistrent les révisions. Les évaluations couvrent usage légitime, ambiguïté, instruction externe hostile et tentative d’action hors périmètre. Aucune donnée réelle dans les fixtures.

## kombe-business-invariants

**Mission :** Adopter et traduire les invariants métier.

**Déclenchement :** Modification des obligations, quorum, rotation, compensation ou plafonds.

**Entrées :** ADR adoptés, contrats, exemples chiffrés.

**Procédure :** Inventorier règles ; expliquer chaque calcul ; obtenir arbitrage si ambigu ; définir propriétés, contre-exemples et cas limites.

**Livrable :** Catalogue INV avec source, exemple, contre-exemple et lien de test.

**Interdictions :** Changer une règle financière sans décision ; copier la formule de production comme seul oracle.

**Évaluations minimales :** Cas valide de versement partiel ; dépassement ; compensation répétée ; quorum limite.

**Traçabilité :** lots C04 C06 C07 C08 C09 ; assurance H01 H08.

## kombe-authorization-review

**Mission :** Vérifier les autorisations.

**Déclenchement :** Création/modification de route, export, job ou politique RLS.

**Entrées :** Matrice acteurs/objets/champs/périodes et schéma.

**Procédure :** Tracer contexte groupe ; vérifier identités ; tester refus ; relire l’absence d’effet et de fuite ; examiner réutilisation de pool.

**Livrable :** Matrice d’accès, preuves API/DB et anomalies par sévérité.

**Interdictions :** Confondre rôle UI et autorisation serveur ; utiliser BYPASSRLS pour prouver l’isolation.

**Évaluations minimales :** Autre groupe ; membre exclu ; lien export ancien ; support temporaire expiré.

**Traçabilité :** lots C01 C02 C03 C12 C17 ; assurance H07 H08.

## kombe-concurrency-review

**Mission :** Vérifier transactions et reprises.

**Déclenchement :** Nouvelle commande financière, réservation ou traitement asynchrone.

**Entrées :** Diagramme de transaction, verrouillage, clés idempotentes.

**Procédure :** Définir entrelacements ; synchroniser deux acteurs ; injecter pannes avant/après commit ; relire invariants et outbox.

**Livrable :** Reproducteur de course, état initial/final et preuve d’effet unique.

**Interdictions :** Utiliser des mocks pour prouver un verrou réel ; déclarer exactly-once externe sans preuve fournisseur.

**Évaluations minimales :** Double requête ; concurrence réservation/remplacement ; crash après commit ; deadlock borné.

**Traçabilité :** lots C06 C07 C08 C13 ; assurance H07 H16.

## kombe-harness-integrity

**Mission :** Auditer le dispositif de preuve.

**Déclenchement :** Changement runner, adaptateur, CI ou format des résultats.

**Entrées :** Politique de confiance, références protégées, suites et identités.

**Procédure :** Examiner frontières ; tenter fabrications et rejouements synthétiques ; vérifier accès disque/réseau ; constater statut sans supposition.

**Livrable :** Résultats H01–H20, preuves et limites ; correctifs proposés.

**Interdictions :** Approuver ses propres modifications critiques ; traiter hash ou nom saisi comme identité authentifiée.

**Évaluations minimales :** Faux PASS ; mauvaise cible ; ancien rapport ; attente accessible ; contrôleur modifié.

**Traçabilité :** lots H00 C28 ; assurance H01 H02 H03 H04 H05 H06 H20.

## kombe-release-evidence

**Mission :** Préparer une décision de mise en service.

**Déclenchement :** Candidat de release ou modification de configuration sensible.

**Entrées :** Artefact attendu, rapports CI, revue et décisions métier/données.

**Procédure :** Vérifier complétude et provenance ; lier build/suite/configuration ; inventorier blocages ; préparer décision pour responsable autorisé.

**Livrable :** Manifeste vérifié, matrice de preuves et recommandation GO/BLOCKED.

**Interdictions :** Déployer du seul fait d’une recommandation IA ; reconstruire un autre artefact après recette.

**Évaluations minimales :** Rapport manquant ; digest faux ; revue expirée/inapplicable ; candidat intégral valide.

**Traçabilité :** lots C28 C29 ; assurance H04 H05 H06 H11 H20.

## kombe-recovery-drill

**Mission :** Vérifier la reprise et le rapprochement.

**Déclenchement :** Exercice de restauration ou modification backup/migrations.

**Entrées :** Sauvegardes fictives, objectifs adoptés, révocations, schéma et runbook.

**Procédure :** Restaurer isolément ; bloquer effets externes ; réappliquer révocations ; rapprocher ; mesurer RPO/RTO ; noter pertes.

**Livrable :** Rapport chronométré, écarts, droits testés et mesures correctives.

**Interdictions :** Restaurer production pour un test ; envoyer notifications pendant replay ; masquer perte d’écritures.

**Évaluations minimales :** Sauvegarde avant révocation ; objet manquant ; outbox rejouée ; reprise interrompue.

**Traçabilité :** lots C29 C16 C13 ; assurance H18 H19.
