# Plan global de déploiement KÓMBE

## 1 Résultat attendu

Mettre à disposition un registre utilisable par dix groupes pilotes, par vagues de trois, trois puis quatre, avec historique exportable, indépendance des validations, sécurité vérifiée et reprise démontrée. Le déploiement technique ne clôture pas l'expérimentation économique ; un cycle de dix tours hebdomadaires reste dix semaines environ.

**Calendrier relatif à T0**, date de disponibilité de l’équipe, de l’environnement de création du dépôt neuf et des premières décisions. Les durées ci-dessous sont des enveloppes de planification à rebaser après C00, pas des engagements contractuels. Équipe d'hypothèse : lead/backend, frontend, QA à temps partiel, DevOps/sécurité à temps partiel, produit/terrain et conseil local. Certaines fonctions peuvent être cumulées, la revue critique demeure indépendante de l'auteur.

## 2 Phases, dépendances et livrables

| Phase | Fenêtre indicative | Travaux et prompts | Responsable principal | Condition de sortie |
|---|---|---|---|---|
| P0 Cadrage | S1–S2 | C00 puis H00, menace, contrats, ADR, budget, assurance | Lead + produit | Build neuf ; périmètre/stack/équipe retenus ; G-CONSTRUCTION accepté |
| P1 Fondations | S3–S4 | C01–C05, C11, C28 amorcé | Backend | Migrations, identité, rôle initial, règles et calendrier testables |
| P2 Cœur métier | S5–S8 | C06–C10 ; C14 itératif | Backend + frontend | Déclarer, valider, corriger, contester et clôturer sur données fictives |
| P3 Mise en service | S9–S11 | C12–C17, C18 minimal, C29 ; C28 complet | QA + exploitation | Exports, récupération, sécurité, restauration, notices et support prêts |
| P4 Porte G0 | S12 indicative | Revue de preuves, retests indépendants, exercice incident | Produit + sécurité + données | Décision signée ; aucun blocage critique ouvert |
| P5 Pilote | Après G0 ; durée liée aux groupes | Vagues 3/3/4, formation et observations | Terrain | Trois tours observés puis au moins un cycle réellement achevé |
| P6 Extension G1 et offre G2 | Après critères, pas date automatique | C19, C20 et améliorations issues du terrain | Produit | Complétude, autonomie, sécurité et paiements réels mesurés |
| P7 Extensions | Après décision dédiée | C21–C27 | Direction | Besoin, financement, preuve et porte spécifique satisfaits |

Si un seul développeur intervient, réduire le nombre de chantiers et recalculer les dates. Ne pas conserver S12 comme promesse. La phase P3 démarre sur des incréments stables de P2 ; elle ne doit pas découvrir la politique d'accès à la fin du projet.

## 3 Stack de déploiement de référence

Pour projet neuf : application Node/Fastify servant le client React/Vite sous une même origine ; worker séparé ; PostgreSQL/Auth/stockage privés gérés. Proposition fournisseur : Render payant (web + worker), Supabase payant (projets séparés), GitHub (sources et CI), Resend (email si retenu). Observabilité expurgée avec OpenTelemetry et Sentry ; sauvegarde chiffrée indépendante, par exemple Backblaze B2. La région de base et celle de l'API sont choisies ensemble après mesure Cameroun et revue des transferts. Aucun pays n'est présumé « conforme » par son nom.

Vercel commercial peut être comparé comme alternative pour le projet neuf ; la référence historique au MVP ne vaut pas choix de fournisseur. Le choix de fournisseur ne doit pas imposer un changement d'invariants.

## 4 Environnements et comptes

| Environnement | Données | Secrets et droits | Accès |
|---|---|---|---|
| Local | Fixtures fictives | Secrets locaux non réutilisés | Développeur |
| CI / preview | Jeux synthétiques isolés | Jetons éphémères limités ; aucun secret prod dans PR externe | Équipe |
| Staging | Synthétique ; miroir de schéma | Projet DB/Auth séparé, bucket privé de test | QA autorisé |
| Pilote production | Données réelles après G0 | Comptes organisation, MFA, moindre privilège, budget alerté | Cohorte autorisée |
| Reprise isolée | Copie restaurée protégée | Aucun envoi sortant ; sessions neutralisées | Exploitation sous approbation |

Compte fournisseur au nom de l'entité responsable, administrateurs et suppléants nommés, récupération conservée sous contrôle. Ne pas copier une base nominative de production vers un environnement de développement.

## 5 Pipeline de livraison

1. PR liée aux stories, ADR et scénarios ; revue d'une personne distincte pour les changements d'intégrité.
2. Installation verrouillée ; lint/types ; unitaires ; PostgreSQL réel pour transactions ; contrats API ; tests isolation ; E2E essentiels.
3. SAST, dépendances, secrets, SBOM ; refus d'une preuve manquante. Les actions CI externes sont épinglées à un commit intégral validé ; droits minimaux et identités temporaires lorsque possible. [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use).
4. Build unique d'une image identifiée par digest ; provenance ; promotion du même artefact vers staging puis production.
5. Migration additive sur staging ; compatibilité version N et N−1 testée ; DAST limité à la cible autorisée ; charge et reprise si affectées.
6. Vérification G0 ou gate de release ; revue de déploiement par responsable ; sauvegarde pré-migration récupérable.
7. Déploiement pilote restreint, tests de fumée avec comptes fictifs dédiés ; observation des erreurs et rapprochement.
8. Élargissement seulement si invariants, disponibilité et support restent maîtrisés.

Les commandes exactes appartiennent au dépôt produit par C00/C28. Les prompts demandent de créer et tester ces commandes avant de les utiliser dans une pipeline : aucun `npm run test:security` n'est supposé déjà disponible.

## 6 Migration et retour arrière

Adopter expand/contract : ajouter tables/colonnes compatibles, déployer le code lisant ancien et nouveau, backfill idempotent sous contrôle, vérifier écarts, puis retirer ancien schéma dans une release ultérieure. Une compensation métier n'est pas une migration descendante.

Déclencheurs d'arrêt proposés : accès intergroupe confirmé ; écart financier non expliqué ; compensation répétée ; erreur de droits ; taux 5xx >1 % pendant cinq minutes sous volume significatif ; file de notifications vieillissant sans progression. Les seuils techniques se règlent après baseline, les défauts d'intégrité déclenchent immédiatement un gel ciblé ou global.

Procédure : geler les mutations affectées → capturer journaux et séquences → maintenir lecture sûre → remettre l'image précédente si schéma compatible → corriger en avant si les migrations ont changé la sémantique → réconcilier → retester → rouvrir. **Ne jamais restaurer une ancienne DB comme simple rollback après de nouvelles écritures acceptées** : cela exige un incident de reprise, l'inventaire des écritures perdues et le rapprochement avec les groupes.

## 7 Sauvegarde et reprise

Cible source : RPO ≤24 h, RTO ≤8 h. Proposition de renforcement : RPO ≤1 h pour validations reconnues ; chiffrer PITR/archivage et vérifier le plan fournisseur. Le RTO reste ≤8 h à démontrer. Aucune garantie n'est annoncée avant exercice réel.

Sauvegarder DB, objets exportés nécessaires, politiques d'accès, configurations et références de clés ; clés dans un contrôle d'accès séparé. Ne pas supposer qu'une sauvegarde de DB inclut les objets de stockage ou tous les éléments du service d'identité. Conserver un journal de révocations/effacements hors du point de restauration cible.

Exercice avant G0 : choisir un point de restauration → isoler réseau sortant et notifications → restaurer DB et objets → vérifier schéma, séquences, sommes et empreintes → réappliquer droits/effacements → invalider sessions périmées → reprendre outbox sans réenvoyer aveuglément → tests T01/T14/T16 et comptage des écarts → mesurer RPO/RTO → validation exploitation/QA. Au pilote, exercice mensuel proposé et après modification majeure du mécanisme.

## 8 Observabilité et objectifs

| Mesure | Cible proposée | Observation / alerte |
|---|---|---|
| Disponibilité | 99,5 % mensuel, soit 216 min sur 30 jours | Sondes extérieures + incidents ; ne pas réduire l'objectif aux heures de bureau |
| Latence API | p95 <700 ms côté serveur | 10 groupes ×12 membres, 30 utilisateurs virtuels, 10 min après échauffement ; lecture/mutation séparées |
| Erreurs serveur | <1 % pendant charge de référence | Exclure erreurs métier attendues des 5xx, garder le détail |
| Intégrité | Aucun écart de reconstruction | Comparaison journal/projections quotidienne et après migration |
| Outbox | Âge plus ancienne tâche éligible <5 min hors panne fournisseur | Alerte propriétaire ; métrique sans identifiant utilisateur |
| Backup | Dernière copie récupérable compatible RPO | Alerte dès dépassement ; présence de fichier ≠ restaurabilité |
| Mobile | Parcours compris et utilisables | Android 2 Go RAM + téléphone courant ; réseau lent 400 ms RTT, 1 Mbps descendant, coupures |
| Support | Horaires réels et suppléant | Aucun 24/7 implicite ; responsable incident défini pour périodes sans présence |

Le profil de charge est un point de départ de recette, pas une mesure réalisée ni un dimensionnement définitif. Tests d'abus limités à staging autorisé, sans viser utilisateurs ou services tiers réels.

## 9 Gates et responsabilités

| Porte | Décision | Preuves minimales |
|---|---|---|
| G0 | Premières données réelles | Intégrité/isolation, parcours critiques, récupération, export, restauration, notices et revue locale, support, aucun défaut critique bloquant |
| G1 | Extension contrôlée | ≥90 % complétude, autonomie démontrée, au moins un cycle terminé, incidents maîtrisés, couverture ASVS applicable élargie |
| G2 | Confirmation offre payante | ≥25 % des groupes éligibles exposés ont effectivement payé ; coûts et annulations mesurés |
| G3 | Paiement du pot futur | ≥30 groupes actifs, trois cycles réellement observés, rétention ≥60 %, saisie sans support ≥95 %, litiges <2 %, résolution médiane <48 h ; contrats, droit et recette financière dédiés |
| G4 | Croissance | Marge contributive positive, acquisition récupérable, support financé et exploitation maîtrisée |

Une porte commerciale ne remplace pas une porte juridique. Le scoring et l'assurance exigent leur propre décision même après G3. Les seuils de terrain sont exploratoires : publier numérateurs, dénominateurs et dates.

## 10 Budget et achats

L'enveloppe de 5 000 000 XAF de la référence suppose un MVP réutilisable et une participation fondatrice déjà financée. La reproduire uniquement comme hypothèse de pilotage : revue/corrections/QA 2 500 000 ; sécurité externe 800 000 ; juridique/données 500 000 ; terrain 600 000 ; hébergement/messages 200 000 ; réserve 400 000. Si le dépôt n'est pas réutilisable, demander des devis sur lots et réviser cette enveloppe avant engagement.

Le coût cloud mensuel doit additionner web + worker + DB primaire + staging + stockage + sauvegarde séparée + trafic + email/SMS + observabilité + domaine + taxes + change. Budgéter aussi les sièges, support et surconsommations. Ne pas convertir des dollars en XAF avec un cours supposé. Activer alertes 50/80/100 % du budget interne et fixer qui peut augmenter les plafonds. La perte de messages marketing peut être tolérée ; l'arrêt du registre par surprise ne l'est pas.

## 11 Premier lot concret à remettre à l'équipe

Obtenir dépôt, branche/commit, démonstration authentifiée fictive, inventaire des comptes et plans, export de schéma sans données, liste des personnes et disponibilité, montant de budget, fréquence des groupes pilotes. Exécuter C00 ; adopter ADR01–ADR10 ; chiffrer P1/P2 ; établir la liste des scénarios G0 ; préparer le contrat d'hébergement et les notices. Aucun accès réel n'est nécessaire pour commencer les tests sur fixtures.


## 11 Construction assistée et protection de livraison

La fenêtre S1–S2 inclut désormais H00. Si la chaîne d’assurance dépasse cette enveloppe, recalculer tout le calendrier ; ne pas réduire les preuves pour maintenir S12. Un agent IA prend en charge des tâches, pas les responsabilités juridiques, métier et de mise en service. Budgéter API/abonnements IA, runners, artefacts, revues et maintenance des skills.

G-CONSTRUCTION précède la réalisation métier encadrée. G0 exige aussi son rejeu sur la chaîne effective, les cas applicatifs réels, les mutations critiques, l’exercice de reprise et les décisions organisationnelles. Les fichiers historiques de preuve ne vérifient pas encore mécaniquement toutes ces exigences.

La CI de confiance charge contrôleur et attentes depuis une référence approuvée. Les jobs candidats ne reçoivent pas les secrets de release ; les rapports sont liés au commit, digest, suite, schéma et configuration. Les approbations sont authentifiées. La production reçoit l’artefact testé ; un rebuild produit un nouveau candidat à vérifier. Les modifications de workflow, de permissions et de hooks sont revues avant activation.

Pour les restaurations : reprendre H18/H19 sur KÓMBE ; réappliquer révocations et effacements, contrôler DB/objets, empêcher les effets externes pendant replay et rapprocher les opérations reconnues. Une simple présence de sauvegarde ne clôture pas le contrôle.
