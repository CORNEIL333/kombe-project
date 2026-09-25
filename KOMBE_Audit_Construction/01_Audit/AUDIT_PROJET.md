# Audit professionnel du projet KÓMBE

**Révision 2.0 — 17 septembre 2026.** La construction à zéro avec agents IA est confirmée. A01 devient la création du dépôt neuf et du build reproductible ; les références à un MVP ancien restent historiques. Lire aussi [les risques agents](RISQUES_AGENTS_IA.md) et [les zones noires/grises](ZONES_NOIRES_ET_GRISES.md). Les nouvelles protections sont prescrites, non démontrées installées.

## 1 Verdict et périmètre de décision

**GO pour la construction et une démonstration fictive ; NO-GO documentaire pour l'ouverture à des données réelles tant que les preuves G0 manquent.** Ce verdict ne prétend pas qu'une vulnérabilité a été reproduite. Il constate que le dossier ne contient pas les éléments permettant d'autoriser une exploitation réelle.

Le projet répond à une difficulté concrète : rapprochement des déclarations, confirmations, règles et décisions d'une tontine. La v2 a déjà corrigé plusieurs erreurs historiques : confusion cycle/tour, concurrence des paiements partiels, statut des litiges, portée des empreintes, conservation et promesse de Gemma 100 Mo. Ces corrections doivent être adoptées explicitement, puis vérifiées dans le logiciel.

**Atouts à préserver :** registre seul ; monolithe modulaire ; autorité serveur ; obligations distinctes des déclarations ; séparation des personnes par opération ; contre-écritures ; snapshots de vote ; outbox transactionnelle ; séparation de l'abonnement et du pot.

## 2 Méthode et niveau de preuve

Lecture croisée de la référence v2, du backlog, des contrats techniques, des notices, du registre de modifications et des sources originales, avec extraction du PDF et des DOCX. Recensement des fichiers et des identifiants, comparaison des contrats et des règles, examen des scénarios adverses, recherche ciblée dans les documentations officielles et Free for Developers.

Les citations internes donnent le fichier et la section stable. Les copies documentaires sont sous `06_Sources/Documentation_entree/`. Les sources originales restent dans l'archive d'entrée dont l'empreinte est conservée ; elles ne sont pas rééditées. Les notes numériques de l'ancien audit ne sont pas reprises comme nouvelles mesures.

| Domaine | Maturité documentaire observée | Preuve opérationnelle disponible |
|---|---|---|
| Positionnement et périmètre | Bien définis, adoption à formaliser | Aucune validation terrain actuelle fournie |
| Règles et intégrité | Détaillées, quelques contrats incomplets | Aucun test applicatif fourni |
| Sécurité et isolation | Exigences pertinentes | Aucun scan, pentest ou configuration fourni |
| UX et accessibilité | Critères présents | Observations anciennes uniquement |
| Données personnelles | Notices préparatoires | Identité, sous-traitants et décisions à renseigner |
| Exploitation | Objectifs et procédures esquissés | Aucune restauration démontrée |
| Économie | Hypothèses séparées des volumes | Aucun paiement client ou coût réel fourni |

## 3 Registre des constats

P0 = fermeture ou preuve indispensable avant données réelles ; P1 = avant extension ; P2 = futur. « Non démontré » indique une preuve absente, pas un défaut prouvé du code.

| ID | Niveau et nature | Référence précise | Constat et risque | Action et preuve de fermeture |
|---|---|---|---|---|
| A01 | P0 • non démontré | Archive complète ; Référence §10 et §24 | Construction neuve confirmée ; stack exacte, versions et reproductibilité à établir. | C00 : dépôt neuf, SHA, build reproductible, versions/licences ; H00 : assurance de la construction. |
| A02 | P0 • lacune de contrat | Référence §7 ; Backlog 4.9 | Changement de rôle à approbateur distinct, mais premier groupe créé par une personne : amorçage insuffisamment défini. | En configuration seulement, nominés acceptent leurs fonctions ; tous acceptent règles et liste initiale avant cycle. Aucun droit financier actif avant démarrage. Test fondateur seul bloqué. |
| A03 | P0 • lacune de contrat | Contrats §3 et §5 ; Backlog 6.10 et 18.4 | Correction détaillée pour cotisations, pas pour décaissements et frais déjà confirmés. | Ajouter demande/approbation/contre-écriture de décaissement et frais, unicité de compensation, gel clôture. Test correction après réception externe sans faux remboursement. |
| A04 | P0 • lacune de contrat | Contrats §4 | Le remplacement après compensation doit protéger la capacité réservée ; ordre des verrous et échec intermédiaire non spécifiés. | Ordre de verrou unique groupe→cycle/tour→obligation→opération, transaction compensation+réservation/remplacement, retries bornés des deadlocks. Test course remplacement/déclaration. |
| A05 | P0 • spécification incomplète | Contrats §6 | « Clés ordonnées » ne définit pas entièrement Unicode, nombres, encodage, version et genèse de la chaîne. | ADR profil canonique RFC 8785, entiers sûrs, hash initial fixé, fixtures interlangages et versionnement. Contrôle externe des points d'ancrage. |
| A06 | P0 • non démontré | Référence §14 ; Contrats §5 | Isolation demandée, mais rôle DB réel et contexte du pool non connus. | Rôle non propriétaire sans BYPASSRLS, contraintes composites, contexte transactionnel remis à zéro, tests de réutilisation de connexions et jobs. |
| A07 | P0 • mise à niveau | Backlog 1.2 | Plancher de 12 caractères laissé à revoir ; insuffisant pour l'alignement NIST proposé en mot de passe seul. | Proposition : 15 minimum si facteur unique, maximum accepté ≥64, blocklist, limitation et récupération testées. MFA des comptes techniques et support avant G0. [NIST](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/) |
| A08 | P0 • non démontré | Notices §1 et §4 | Éditeur, pays, contrats, bases, durées et contacts absents. | Responsable données + conseil local : registre des traitements, notices factuelles, contrats et procédure de droits validés. |
| A09 | P0 • cohérence de reprise | Référence §17 ; Backlog 18.10 | RPO 24 h pourrait perdre des validations reconnues et restaurer des droits révoqués. | Proposer RPO ≤1 h avant données réelles ; sinon acceptation écrite de 24 h et rapprochement obligatoire. Stocker registre de révocations/effacements séparé de la sauvegarde restaurée. Test chronométré. |
| A10 | P0 • non démontré | Référence §18 ; Backlog 14.8–14.10 | Exigences de sécurité sans preuves exécutées. | Harness raccordé, revue manuelle indépendante, périmètre ASVS versionné et retests. Zéro défaut critique/élevé exploitable sur isolation/intégrité. |
| A11 | P1 • lacune de contrat | Contrats §4 ; Référence §13 | Notifications au moins une fois : un crash après acceptation prestataire peut provoquer un doublon. | Déduplication locale et identifiant fournisseur si disponible ; état ambigu réconcilié. Aucun « exactly once » externe promis sans contrat prestataire. |
| A12 | P0 si cache réel • précision | Référence §13 ; Backlog 6.9 | Brouillon récupérable et purge sur déconnexion : UX d'effacement à rendre explicite. Révocation hors ligne non immédiate. | Brouillon lié au compte et appareil ; avertir avant logout ; TTL fixé, sans cache sur appareil partagé. Test changement de compte et horloge manipulée. |
| A13 | P0 • lacune d'autorisation | Référence §7 ; Contrats GET /exports/{id} | « Historique personnel » après départ ne définit pas tous les champs et périodes autorisés. | Matrice champ/objet/temps incluant bénéficiaires, votes et pièces ; autorisation à génération ET téléchargement. Annuler liens après révocation ; proxy si révocation immédiate requise. |
| A14 | P1 • cohérence éditoriale | Backlog 1.4, 2.6, 6.1, 14.10, 18.17 | Présupposés anciens subsistent : « absent du MVP », 50 groupes dans la story, « avec preuve », pentest avant G1 contre G0, une/deux approbations support. | Appliquer les commentaires COM01–COM07 ; adopter une seule norme opératoire. |
| A15 | P0 • configuration économique | Audit original p.1 ; Référence §10 | Vercel cité historiquement ; plan souscrit inconnu. Hobby est non commercial. | Vérifier facture/plan. Retenir offre commerciale ou migrer après essai. [Vercel](https://vercel.com/docs/plans/hobby) |
| A16 | P1 • hypothèse non validée | Référence §19–21 | 1 500 XAF/mois, conversion 25 % et budget 5 M XAF sont des hypothèses. | Mesurer temps support, frais, attrition, encaissements nets et délai de récupération CAC. Aucun ROI garanti. |
| A17 | P2 • futur | Note IA §1–6 ; Référence §22 | Formats, langues, RAM et consommation des modèles non benchmarkés ; MiniLM exact non identifié dans la note. | Aide déterministe d'abord. Révision précise du modèle et licence ; dataset FR/EN tenu à l'écart ; RAM/latence/batterie sur téléphones réels. |
| A18 | P0 périmètre / G3 futur | Backlog 17.1–17.5 | Un connecteur d'abonnement peut glisser vers l'encaissement du pot ; aucune autorisation ou convention fournie. | Comptabilités et routes distinctes, flags serveur fermés ; dossier prestataire et avis local avant paiement du pot. |
| A19 | P0 • lacune de contrat | Contrats §3 ; Backlog 4, 7, 8 | Routes manquantes pour délégation, départ, pause, réouverture litige, clôture proposition et gestion quotas. | Compléter OpenAPI par commandes, y compris celles reportées avec route désactivée ou non livrée ; pas de PATCH libre. |
| A20 | P1 • gouvernance | Référence §23 ; Backlog 9.2 | Chaîne d'intégrité P1, mais discours « vérifiable » et points de contrôle déjà structurants. | Proposition : profils canoniques + vérificateur avant G0 ; ancrage séparé avant usage d'un argument d'intégrité avancée. Ne pas imposer blockchain. |
| A21 | P0 • périmètre métier | Référence §5, §11 ; Backlog 3.3 | Pénalités désactivées « par défaut » pourrait laisser un chemin d'activation sans rapprochement complet. | Désactivation serveur non configurable au pilote ; activation ultérieure uniquement après ADR et comptabilité dédiée. |
| A22 | P1 • minimisation des mesures | Backlog 16.1 ; Référence §19 | Définition du funnel ne borne pas ses propriétés ni la cardinalité des métriques. | Liste blanche d'événements, agrégats par cohorte, aucune référence ou montant individuel, pas de session replay des écrans métier. |

## 4 Menaces et frontières de confiance

Actifs : identités, adhésions, règles acceptées, déclarations, décisions, historique, exports, clés et preuves de restauration. Adversaires à simuler : membre d'un autre groupe, membre ancien, personne cumulant rôles, compte récupéré abusivement, opérateur support, administrateur DB compromis, dépendance ou fichier malveillant, fournisseur indisponible.

| Frontière | Scénario | Contrôle prioritaire | Test attendu |
|---|---|---|---|
| Téléphone → API | Rejouer une déclaration après coupure | Idempotence durable et droits actuels | Effet unique même après cache expiré |
| API → DB | Réutiliser connexion du groupe A pour B | Contexte transactionnel + RLS + FK composites | Aucune ligne A lue sous B |
| Acteurs → validation | Trésorier bénéficiaire ou déclarant | Identités distinctes, suppléant accepté | Refus sans aucune écriture |
| Journal → projection | Modifier un total dérivé | Reconstruction et comparaison | Détection et gel ciblé |
| Worker → prestataire | Crash après envoi | Déduplication, statut ambigu, réconciliation | Pas de mutation financière répétée |
| Export → utilisateur | Télécharger après exclusion | Réévaluation objet/champ/temps | Refus ou export personnel refiltré |
| Sauvegarde → reprise | Ancienne session redevient active | Réapplication révocations et purge | Session ancienne refusée avant réouverture |
| Donnée → assistant | Nom contenant une instruction | Récupération autorisée et sortie structurée | Aucun outil d'écriture, fuite ou chiffre inventé |

## 5 Recommandation d'architecture

La construction neuve est confirmée ; la base de travail proposée est un monolithe TypeScript avec client React/Vite, API Fastify, PostgreSQL canonique, worker outbox et identité gérée. Un premier choix économique concret est Render payant pour application et worker, Supabase payant pour DB/Auth/exports privés, GitHub pour sources/CI et un fournisseur email transactionnel. Vercel commercial reste une alternative à comparer pour le nouveau projet. Toutes ces désignations sont des recommandations, aucun service n'est attesté installé.

Ne pas multiplier microservices, brokers, bases vectorielles ou Kubernetes au pilote. Une base transactionnelle facilite la démonstration des invariants. [PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html), [transactions node-postgres](https://node-postgres.com/features/transactions).

## 6 Conditions de clôture de l'audit

Créer le dépôt neuf et les environnements fictifs ; faire adopter les décisions A02–A05, A09, A12–A14 et A21 ; attribuer les responsables ; exécuter les suites critiques et la restauration ; renseigner le dossier de données ; organiser une revue indépendante. Le verdict G0 sera alors révisé sur preuves datées du même commit et du même schéma.
