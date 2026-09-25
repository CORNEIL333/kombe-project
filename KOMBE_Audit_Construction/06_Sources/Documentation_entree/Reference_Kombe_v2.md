# Documentation de référence du projet KÓMBE

Vision produit et spécifications pour un pilote de tontines au Cameroun

Version documentaire 2.0 proposée • 14 septembre 2026

Ce dossier rassemble et restructure les cinq documents transmis. Il complète les règles métier, l’architecture, les données, les interfaces, la sécurité, l’exploitation, la recette, le pilote et les propositions commerciales. Il s’adresse au porteur du projet, aux développeurs, au responsable terrain et aux personnes chargées de vérifier le lancement.

La recommandation centrale est de construire un registre partagé de tontines rotatives fermées, avec des règles acceptées, des validations identifiables et des corrections traçables. Le premier pilote doit démontrer que les groupes tiennent leur registre sans assistance permanente et acceptent de payer le service.

Les spécifications ci-dessous sont une proposition de référence à adopter par l’équipe. Elles ne constituent ni une description du code existant, ni une attestation de sécurité, ni une autorisation réglementaire. Aucun dépôt, environnement de production ou contrat n’a été fourni et aucun test du logiciel n’a été effectué dans cette mission.

L’archive contient aussi le backlog intégral révisé, les contrats techniques proposés, les projets de notices et procédures, ainsi que les cinq sources originales conservées sans modification. Les corrections et les arbitrages sont explicités afin que les recommandations nouvelles ne soient pas confondues avec des décisions déjà prises.

## Guide de lecture du dossier

### Pour décider
Lire les chapitres 1 à 4, puis 19 à 24. Ils expliquent le périmètre recommandé, les contradictions corrigées, les revenus possibles, les moyens nécessaires et les décisions à prendre.

### Pour concevoir et développer
Lire les chapitres 5 à 14. Les compléter avec Documentation/Backlog_Kombe_v2.md et Documentation/Contrats_techniques.md. Les identifiants historiques 1.1 à 17.5 sont conservés dans le backlog ; les ajouts utilisent le préfixe 18.

### Pour faire fonctionner le pilote
Lire les chapitres 15 à 18 et 23. Les guides, scénarios de recette, définitions des indicateurs et procédures d’incident permettent de préparer une expérimentation contrôlée.

### Statut des informations
« Source » désigne ce qui figure dans les fichiers transmis. « Correction » désigne une erreur ou contradiction identifiée. « Proposition » désigne une règle nouvelle recommandée pour rendre le projet cohérent. « À vérifier » désigne une information absente ou non démontrée, notamment l’état réel du logiciel, les prestataires et les contrats.

### Hiérarchie documentaire proposée
Après adoption par l’équipe, le document de référence v2 et ses contrats détaillés priment sur les formulations historiques contradictoires. Le backlog traduit ces règles en travaux et tests. Les sources originales restent des éléments de contexte et de traçabilité, pas des spécifications concurrentes.

### Navigation
Les titres Word permettent de naviguer dans le volet de navigation. Le dossier suit cet ordre : diagnostic documentaire ; contexte et vision ; périmètre ; couverture fonctionnelle ; règles financières ; cotisations ; pouvoirs ; votes ; litiges ; architecture ; données ; API ; hors connexion ; sécurité ; données personnelles ; guide utilisateur ; exploitation ; recette ; pilote ; économie ; budget et propositions ; IA ; feuille de route ; décisions ; sources.

## 1 Diagnostic documentaire et corrections

Les sources comprennent un audit public du 13 septembre 2026, une étude des tontines camerounaises, un inventaire, un backlog et une note d’IA locale. L’audit décrit des observations de l’interface publique ; une fonction « non visible » n’est pas nécessairement absente du code. Cette distinction est maintenue dans le dossier.

| Sujet | Problème dans les sources | Traitement proposé |
|---|---|---|
| Étendue du pilote | ROSCA seule mais groupe d’accumulation inclus | Retirer l’accumulation du pilote produit |
| Calendrier | Trois cycles annoncés en 90 jours | Mesurer d’abord trois tours puis les cycles réellement achevés |
| Gouvernance | Vote majoritaire et acceptation individuelle mal articulés | Séparer approbation collective et acceptation des engagements |
| Validation | Double et triple validation sans règle d’indépendance complète | Deux personnes distinctes au minimum ; troisième selon règle |
| Confidentialité | Preuves bancaires interdites mais pièces exigées | Sans pièces au pilote ; justificatifs minimisés ultérieurement |
| Conservation | Journal éternel et suppression personnelle | Durées motivées et données identifiantes séparées |
| Architecture | PWA PostgreSQL et Flutter SQLite décrits comme acquis | Serveur canonique proposé ; clients et cache à confirmer |
| IA | Gemma 3n présenté autour de 100 Mo | Retirer cette promesse ; benchmark avant choix |
| Budget | Enveloppes pilote et annuelles mélangées | Séparer investissement pilote, charges et extension |

Le backlog source comporte exactement 105 fiches détaillées dans les modules 1 à 16 et 5 perspectives dans le module 17, soit 110 entrées. Les 66 fiches marquées uniquement P0 ne forment pas un planning : une priorité indique une importance, pas une estimation de travail.

La documentation manquante ajoutée couvre notamment l’idempotence, les accès par objet, le calcul du quorum, les montants partiels, les litiges après validation, la réconciliation, le droit de retrait, les sauvegardes, les incidents et les critères de recette. La conformité et les seuils techniques restent à démontrer par des pièces et des tests.

## 2 Contexte et proposition de valeur

### Comprendre les tontines sans les confondre
L’étude fournie décrit plusieurs mécanismes : rotation simple, tirage, enchères, accumulation avec prêts, secours, formes mixtes et tontines d’affaires. Une coopérative ou un établissement de microfinance est une organisation distincte ; son existence ne prouve pas qu’une application dispose des mêmes autorisations. Les catégories servent à comprendre les usages et à choisir ce que le logiciel prend en charge.

La tontine apporte aussi de la discipline, de l’entraide, de la proximité et un réseau social. Le logiciel doit respecter ces pratiques sans reproduire la pression publique ou transformer un retard en accusation. Une référence déclarée ou une validation humaine ne constitue pas une vérification indépendante du mouvement d’argent.

### Problème prioritaire
Le trésorier reconstitue les cotisations entre cahier, messages et souvenirs. Un membre peine à vérifier ce qu’il a déclaré, ce qui a été confirmé, la règle appliquée et la prochaine action attendue. KÓMBE doit rendre ces éléments visibles dans un même historique, compréhensible même pour une personne peu familière des outils numériques.

### Positionnement proposé
KÓMBE est un registre partagé qui aide un groupe à organiser ses règles, suivre ses cotisations déclarées, documenter ses décisions et retrouver son historique. Les paiements de la tontine restent effectués hors de KÓMBE. Le service ne promet pas de garantir le pot, de supprimer la fraude ou de récupérer une somme perdue.

### Segment initial
Commencer avec des groupes préexistants de 8 à 12 adultes, à Yaoundé, qui pratiquent une rotation simple et disposent d’un trésorier ainsi que d’un remplaçant ou contrôleur. Ce choix est une proposition de concentration opérationnelle ; il ne prétend pas représenter toutes les tontines du Cameroun. Les groupes de 13 à 25 membres pourront être inclus après vérification de la charge de validation.

Les statistiques nationales de l’étude restent datées et attribuées à leurs sources. Ni le nombre de comptes Mobile Money ni le volume des cotisations ne constitue le marché payant de KÓMBE. La demande solvable sera mesurée par le pilote.

## 3 Périmètre de lancement proposé

### Pilote fermé
Le pilote prend en charge une tontine rotative fermée, en XAF, à cotisation identique et à une part par membre. Chaque membre reçoit une fois par cycle ; le nombre de tours est donc égal au nombre de membres pour ce modèle. L’interface conserve des champs explicites et vérifie cette égalité, au lieu de confondre membres, séances et cycles.

L’ordre des bénéficiaires est fixé et accepté avant le démarrage. Les paiements partiels sont enregistrables et restent visibles comme incomplets tant que l’échéance n’est pas entièrement couverte. Les excédents sont bloqués dans le pilote, sauf correction préalable de la déclaration. Aucune affectation automatique à un autre tour n’est autorisée.

| Étape | Fonctionnalités proposées | Condition de sortie |
|---|---|---|
| G0 avant données réelles | Identité, règles, calendrier, validation, correction, litiges, export, droits, sauvegarde | Recette critique et responsables désignés |
| Pilote | Parcours simple, assistance mesurée, notifications internes, brouillons | Trois tours observés puis suivi des cycles |
| G1 extension | Multi-groupes amélioré, délégation, bilingue complet, rappels externes | Usage autonome et intégrité démontrés |
| G2 offre payante | Abonnement groupe et quotas explicites | Paiements d’abonnement réellement obtenus |
| P2 | Association, tirage auditable, aide déterministe | Besoin et capacité démontrés |

### Ce qui reste hors de la première version
Accumulation, prêts internes, enchères financières, caisses de secours gérées dans le même pot, plusieurs parts, change de devises, portefeuille KÓMBE, investissement, scoring et paiement automatisé sont exclus. Ils restent dans la vision et dans le backlog futur. Un thème « construction » ou « scolarité » peut être un modèle de présentation ; il ne doit pas activer implicitement une caisse cumulative.

### Limites opérationnelles proposées
Un compte invité explore seulement des données fictives. Une adhésion réelle exige un canal vérifié et l’acceptation des règles. L’appartenance à plusieurs groupes reste possible dans le modèle de données ; le tableau de bord consolidé avancé peut attendre. Le pilote fonctionne en français, avec un protocole bilingue disponible si des participants anglophones sont recrutés.

## 4 Couverture de la documentation fonctionnelle

Les 17 modules existants sont conservés. Les détails et critères historiques sont révisés dans le backlog joint ; les reports de périmètre sont signalés explicitement. Les ajouts du module 18 comblent les dépendances transversales nécessaires à la réalisation.

| Module | Contenu préservé | Référence principale |
|---|---|---|
| 1 Identité | Inscription, sessions, récupération, profil, préférences | Chapitres 14 et 16 |
| 2 Groupes | Modèles, statuts, adhésion, clôture, association | Chapitres 3 et 7 |
| 3 Règles | Montants, cycles, pénalités, quorum, versions | Chapitres 5 et 8 |
| 4 Membres | Rôles, délégation, retrait, défaut, incapacité | Chapitres 7 et 9 |
| 5 Calendrier | Tours, échéances, ordre, renouvellement | Chapitre 5 |
| 6 Cotisations | Déclaration, validation, contestation, décaissement | Chapitres 6 et 9 |
| 7 Décisions | Propositions, votes, quorum, historique | Chapitre 8 |
| 8 Litiges | Ouverture, résolution, escalade, statistiques | Chapitre 9 |
| 9 Journal | Événements, intégrité, projections, audit | Chapitres 10 et 11 |
| 10 Exports | Relevés, empreintes, impression, partenaires | Chapitres 12 et 16 |
| 11 Notifications | File, préférences, WhatsApp, SMS, push | Chapitres 13 et 17 |
| 12 Expérience | Parcours, réseau faible, accessibilité, langues | Chapitres 13 et 16 |
| 13 Données et cadre | Notices, droits, recherche, contrats, scoring | Chapitre 15 |
| 14 Sécurité | Accès, secrets, reprise, tests, incident | Chapitres 14 et 17 |
| 15 Monétisation | Gratuit, groupe, association, options, test prix | Chapitre 20 |
| 16 Pilote | Mesure, indicateurs, risques | Chapitres 18 et 19 |
| 17 Perspectives | Paiement, passeport, partenaires, assurance | Chapitres 22 et 23 |

Une fonctionnalité décrite n’est pas réputée développée. Le suivi d’exécution devra ajouter, pour chaque fiche, un responsable, une estimation, un lien vers la réalisation, le résultat de recette et la version livrée.

## 5 Règles financières et calendrier

### Unités et calculs
Stocker les montants en entiers XAF, jamais en nombres à virgule flottante. Le code de devise est fixé au groupe et au cycle. Pour N membres et une cotisation c, le pot théorique par tour vaut N × c. Pour T tours, le total théorique du cycle vaut N × c × T. Les encaissements déclarés ne sont pas un revenu de KÓMBE.

Exemple de recette : 10 membres, 5 000 XAF par semaine et 10 tours donnent 50 000 XAF par tour et 500 000 XAF sur le cycle. Un membre verse 50 000 XAF au total et reçoit une levée théorique de 50 000 XAF. Après sa levée, il continue à cotiser. Une cotisation fractionnée en 2 000 puis 3 000 XAF correspond à une seule obligation de 5 000 XAF.

### Séparer les indicateurs
Afficher distinctement attendu, déclaré, validé, contesté et restant dû. Le total validé correspond aux écritures validées nettes de leurs contre-écritures. Le montant contesté déjà validé reste visible séparément et n’est pas effacé du total historique. Aucun indicateur ne doit être intitulé « argent disponible chez KÓMBE ».

Pour clôturer un tour : contributions validées nettes = décaissements validés nets + frais du groupe validés. Les frais payés personnellement par un membre en dehors du pot sont séparés et ne sont pas déduits deux fois. Les pénalités sont désactivées par défaut au pilote ; si elles sont activées, leur destination et leur rapprochement sont définis dans les règles et séparés de la rotation.

### Dates et exceptions
Conserver les horodatages serveur en UTC ; afficher les dates métier dans Africa/Douala. Une date mensuelle au 31 est ramenée au dernier jour du mois si nécessaire, selon une règle visible et acceptée. Une échéance doit préciser l’heure limite, le délai de grâce et la version des règles.

La présence d’un impayé interdit une clôture normale. Un arrêt exceptionnel produit un bilan de sortie avec écarts et obligations non résolues ; il ne transforme jamais une dette en paiement. Le nombre de tours restants n’est pas raccourci automatiquement lors du départ d’un membre.

## 6 Déclarations et validation des cotisations

### Circuit proposé
Une échéance attendue est distincte des déclarations qui la couvrent. Le membre saisit un montant, un canal et une date de versement alléguée. Pour des espèces, la référence externe est facultative ; le système crée un numéro de déclaration. Pour Mobile Money ou banque, une référence est demandée si disponible ; son absence reste explicite et exige une vérification humaine motivée. La référence n’est jamais assimilée à un reçu authentifié.

| Passage | Acteur autorisé | Effet sur le total validé |
|---|---|---|
| Brouillon vers déclarée | Membre ou mandataire tracé | Aucun |
| Déclarée vers confirmée | Trésorier indépendant du déclarant | Aucun si contrôleur requis |
| Confirmée vers validée | Contrôleur indépendant si requis ; sinon serveur | Ajout une seule fois |
| Déclarée ou confirmée vers rejetée | Validateur habilité avec motif | Aucun |
| Validée vers compensée | Circuit de correction indépendant | Contre-écriture du montant d’origine |

Deux personnes distinctes sont nécessaires : déclarant et confirmateur. Si un contrôleur est requis, il doit être distinct des deux. Lorsqu’un trésorier déclare sa propre cotisation, un suppléant habilité la confirme. Si cette indépendance est impossible, l’opération reste bloquée ; le fondateur ne peut pas forcer le passage.

### Contestation et correction
Le litige est un objet séparé, avec un état ouvert ou résolu ; il ne remplace pas l’état comptable de la déclaration. Une contestation avant validation bloque cette validation. Après validation, elle bloque la clôture et les nouvelles actions dépendant du montant contesté. Elle ne réécrit pas ce qui a déjà été enregistré ou versé hors application.

La correction d’une déclaration validée crée une contre-écriture totale liée à l’original, puis, si nécessaire, une nouvelle déclaration correcte. Les deux objets conservent leurs acteurs et motifs. Le serveur empêche deux compensations du même événement.

### Versement au bénéficiaire
Le trésorier déclare le montant versé et les frais supportés par le groupe ; le bénéficiaire confirme la réception. Un contrôleur distinct intervient selon les règles. Cette opération documente un mouvement externe : aucun bouton ne déclenche un transfert de fonds.

## 7 Membres et séparation des pouvoirs

Les rôles sont des fonctions, pas une hiérarchie donnant automatiquement tous les pouvoirs au fondateur. Les autorisations dépendent du groupe, de l’objet, de l’état, de la période d’adhésion et de l’identité de la personne. Un utilisateur peut exercer des fonctions différentes dans deux groupes.

| Action | Membre | Administration | Trésorier | Contrôleur |
|---|---|---|---|---|
| Lire le registre commun | Oui | Oui | Oui | Oui |
| Déclarer sa cotisation | Oui | Oui | Oui | Oui |
| Confirmer une cotisation | Non | Seulement si délégué | Oui si indépendant | Si délégué et indépendant |
| Contrôler une validation | Non | Non par défaut | Non sur sa confirmation | Oui si indépendant |
| Inviter et gérer le groupe | Non | Oui | Non par défaut | Non par défaut |
| Proposer une règle | Oui | Oui | Oui | Oui |
| Voter | Si éligible | Si éligible | Si éligible | Si éligible |
| Exécuter un changement adopté | Non | Oui avec préconditions | Selon objet | Selon objet |
| Effacer une trace validée | Jamais | Jamais | Jamais | Jamais |

Le secrétaire prépare les comptes rendus et propositions sans droit financier supplémentaire. Le fondateur devient administrateur initial ; le transfert de responsabilité nécessite une procédure tracée. Le support KÓMBE n’est pas un rôle de la tontine.

### Admission et départ
Une invitation est nominative ou limitée en usage, expirante et révocable. Le lien ne révèle pas le registre avant authentification et adhésion. Le groupe vérifie l’identité sociale ; un téléphone vérifié ne vaut pas pièce d’identité. Un nouvel arrivant après démarrage attend normalement le cycle suivant.

Le retrait ou l’exclusion désactive les actions futures tout en préservant les obligations déjà documentées. Un accès limité à l’historique personnel est prévu sans donner accès aux événements postérieurs au départ. En cas de décès ou d’incapacité, le groupe documente un gel et la procédure externe de traitement ; l’application ne désigne pas automatiquement un héritier ni n’exige un dossier médical.

Tout changement de rôle impose un motif, l’identité du proposant, un approbateur distinct et une notification de sécurité. Les cumuls peuvent être autorisés, mais jamais pour contourner l’indépendance au niveau d’une même opération.

## 8 Règles versionnées et décisions collectives

### Création et modification
Le groupe démarre après acceptation de la version initiale par tous ses membres actifs. Une règle comprend son identifiant, sa version, son contenu, la procédure de vote, sa date d’effet et les acceptations individuelles. Aucune version ne modifie rétroactivement une échéance passée.

Proposition d’arbitrage : les changements financiers essentiels, tels que montant, ordre ou obligations restantes, s’appliquent au cycle suivant. Une exception pendant le cycle exige l’acceptation de toutes les personnes concernées et la résolution des conséquences documentées. Les modifications administratives peuvent prendre effet au prochain tour si les règles initialement acceptées le permettent.

### Quorum sans ambiguïté
À l’ouverture du vote, figer la liste des électeurs éligibles et la version des règles. Un départ ou une arrivée ne modifie pas silencieusement le dénominateur. S’il devient nécessaire de changer l’électorat, annuler la proposition avec motif et en ouvrir une nouvelle. Les conflits d’intérêts et exclusions du vote sont appliqués avant ce gel.

Exemple proposé : quorum de deux tiers, arrondi au supérieur, et majorité strictement supérieure à la moitié des suffrages oui/non. Avec 10 électeurs, il faut 7 participants. Quatre oui, deux non et une abstention atteignent le quorum et approuvent la proposition. Trois oui, trois non et une abstention donnent une égalité et un rejet. Les abstentions comptent pour la participation, pas pour la majorité ; aucun suffrage exprimé conduit au rejet.

### Exécution contrôlée
Une proposition possède une date de clôture serveur, un objet précis et une empreinte de la version proposée. Un vote par électeur est enregistré ; aucun vote hors délai n’est accepté. L’exécution exige à la fois le résultat positif et les acceptations individuelles requises. La date d’effet et les personnes concernées sont affichées.

Si une personne refuse un nouvel engagement financier, conserver la version actuelle jusqu’à un accord ou à une sortie documentée. Ne pas créer des montants incohérents au sein du même tour. Une modification d’accès urgente destinée à contenir un incident suit une procédure de sécurité distincte, journalisée et revue ensuite.

## 9 Litiges et situations exceptionnelles

### Procédure de résolution
Un membre ouvre un litige depuis une déclaration, une décision, un rôle ou un versement au bénéficiaire. Il décrit les faits et la correction demandée. Les pièces ne sont pas obligatoires au pilote. L’application attribue un numéro, identifie les parties, applique les restrictions sur l’objet concerné et désigne des personnes non impliquées pour l’examen.

Le groupe répond selon ses règles. Le responsable enregistre sa décision, les personnes entendues, le motif et les actions correctives. Une résolution qui modifie un montant déclenche le circuit de contre-écriture ; le bouton « résolu » ne modifie aucun total à lui seul. Un recours ou une réouverture conserve le lien avec le dossier initial.

### Délais proposés
Fenêtre ordinaire de contestation : sept jours après la notification de validation. Un signalement de fraude, d’accès abusif ou d’erreur découverte tardivement reste possible au-delà ; il suit une revue spécifique. Objectif pilote : première prise en charge sous un jour ouvré et résolution médiane sous 48 heures calendaires, à mesurer sans promettre une décision certaine du groupe.

| Situation | Réponse produit proposée |
|---|---|
| Retard | Afficher l’échéance dépassée puis la grâce ; aucune accusation automatique |
| Défaut après levée | Décision humaine documentée ; maintenir les obligations futures |
| Décès ou incapacité | Geler les actions personnelles, documenter le traitement extérieur |
| Trésorier absent | Utiliser une délégation bornée et approuvée par une autre personne |
| Validateurs impliqués | Récusation et désignation de remplaçants ; sinon blocage ciblé |
| Paiement externe contesté | Montrer les déclarations et confirmations ; renvoyer au prestataire pour le mouvement réel |
| Groupe arrêté avec écarts | Bilan de sortie explicite ; aucune clôture présentée comme équilibrée |

### Rôle du support
Le support explique les traces, restaure l’accès et traite les incidents techniques. Il n’impose pas un bénéficiaire, ne transforme pas une déclaration en paiement et ne promet pas un remboursement du pot. Les commentaires sensibles sont visibles seulement aux parties et personnes habilitées ; le registre commun montre l’existence, le statut et l’issue utile du litige.

## 10 Architecture cible et décisions techniques

### Proposition compatible avec un MVP existant
Conserver le client existant s’il peut atteindre les exigences du pilote. L’audit évoque une application web/PWA ; les autres notes évoquent Flutter. Aucune stack n’est confirmée. Ne pas financer une réécriture mobile avant la revue du dépôt, de la couverture de tests et des contraintes des téléphones pilotes.

Architecture proposée : client web ou mobile, API authentifiée, service d’identité, base relationnelle canonique, journal d’événements, vues de lecture et file de tâches. Une base PostgreSQL managée constitue une option ; SQLite est un cache local possible pour un client natif, pas une seconde autorité financière.

### Organisation du code
Un monolithe modulaire suffit au pilote : identité, groupes, règles, calendrier, contributions, décisions, litiges, exports et notifications. Les modules exposent des commandes métier ; ils ne permettent pas de modifier arbitrairement des états ou des totaux. Le module abonnement est séparé des contributions de la tontine.

### Transaction atomique
Pour chaque mutation : authentifier, vérifier l’adhésion et les pouvoirs actuels, verrouiller ou contrôler la version de l’objet, valider les invariants, ajouter l’événement, mettre à jour la projection et ajouter la tâche de notification dans une même transaction. Répondre au client uniquement après validation de la transaction. Un worker livre ensuite les notifications depuis une boîte d’envoi transactionnelle.

Le journal permet de reconstruire les projections. Une vue matérialisée ou un total calculé mis en cache est autorisé s’il est dérivé, non éditable directement et réconcilié avec les événements. L’interdiction source de « tout agrégat mutable » est donc remplacée par l’interdiction des totaux sans traçabilité.

### Intégrité réaliste
Un journal append-only limite les modifications par l’application ; il ne rend pas la base physiquement inviolable. Ajouter des empreintes chaînées, des sauvegardes séparées, des contrôles de privilèges et des points de contrôle exportés. Un administrateur pouvant réécrire toute la base pourrait recalculer une chaîne : la séparation des accès et l’ancrage extérieur sont nécessaires pour détecter ce scénario.

Les versions des dépendances, licences, régions d’hébergement, coûts et limites fournisseurs seront inscrits dans un registre après inspection réelle. Aucun fournisseur cité dans les sources n’est présumé contractuellement retenu.

## 11 Modèle de données et invariants

Le modèle proposé sépare les personnes, les obligations, les opérations déclarées et les preuves de décision. Toutes les données métier d’un groupe portent un group_id ; les relations vers les objets du groupe doivent empêcher le rattachement à un autre groupe.

| Objet | Champs principaux | Contrainte essentielle |
|---|---|---|
| Utilisateur | id, canal vérifié, langue, état | Identifiants protégés et sessions révocables |
| Adhésion | group_id, user_id, rôles, début, fin | Une adhésion courante par utilisateur et groupe |
| Version de règles | id, version, contenu, effet, empreinte | Version publiée non réécrite |
| Acceptation | membre, version, date serveur | Unicité membre et version |
| Cycle et tour | dates, ordre, bénéficiaire, règles | Un bénéficiaire par tour au pilote |
| Obligation | membre, tour, montant dû | Unicité membre et tour |
| Déclaration | obligation, montant, canal, état, version | Montant positif, devise cohérente |
| Validation | déclaration, personne, fonction, décision | Validateurs distincts selon circuit |
| Versement | tour, bénéficiaire, net, frais, état | Confirmation du bénéficiaire |
| Proposition et vote | version, électeurs figés, échéance | Un vote par électeur et proposition |
| Litige | objet, parties, état, motif, résolution | Aucun ajustement financier implicite |
| Événement | séquence, acteur, type, charge, empreinte | Ajout uniquement par commandes autorisées |

### Champs transversaux
Inclure created_at, correlation_id, schema_version et version d’objet lorsque pertinent. Distinguer date serveur et date de paiement alléguée. Les données personnelles identifiantes résident dans des tables séparées ; l’événement contient des identifiants internes et les seuls éléments nécessaires au métier.

### Invariants à tester
Une déclaration ne peut dépasser le restant à couvrir calculé sous verrou. Une contre-écriture référence un événement du même groupe, de même devise et non déjà compensé. Les validations ne sont pas transférées à une déclaration corrigée. Une adhésion révoquée ne peut plus muter un objet. Un tour ne se clôture pas avec un litige ouvert affectant son rapprochement.

Le dictionnaire détaillé et les exemples JSON se trouvent dans Contrats_techniques.md. Il s’agit d’un contrat de conception, à traduire en migrations après revue de la stack existante.

## 12 API et exports vérifiables

### Contrat commun
Préfixe proposé /v1. Les identifiants ne confèrent jamais l’accès. Chaque route relit les droits sur le groupe et sur l’objet. Les mutations utilisent une clé d’idempotence et, pour un objet existant, sa version attendue. Une clé rejouée avec le même corps renvoie le même résultat ; la même clé avec un autre corps produit un conflit. Les lectures paginent par curseur stable.

| Famille | Exemples de routes proposées | Contrôle particulier |
|---|---|---|
| Groupes | POST /groups ; GET /groups/{id} | Invité limité à une démonstration |
| Règles | POST /groups/{id}/rule-versions | Création de version, pas d’écrasement |
| Contributions | POST /groups/{id}/contributions | Montant restant et adhésion |
| Validations | POST /contributions/{id}/confirmations | Identité distincte et version attendue |
| Litiges | POST /groups/{id}/disputes | Objet accessible et parties habilitées |
| Corrections | POST /contributions/{id}/reversals | Original validé et non compensé |
| Votes | POST /proposals/{id}/votes | Électorat figé et délai serveur |
| Exports | POST /groups/{id}/exports | Périmètre visible pour le demandeur |

Les erreurs contiennent un code métier, un message FR/EN et un correlation_id, sans données d’autres groupes. Prévoir 401 pour session absente, 403 ou 404 selon la politique de non-divulgation, 409 pour conflit, 422 pour règle métier et 429 pour limitation. Les exemples complets sont joints dans le contrat technique.

### Export de référence
Un export indique groupe, période, version des règles, séquence de coupure du journal, acteurs autorisés, déclarations, confirmations, corrections, litiges et écarts. Le PDF est lisible sur papier ; le CSV sert à retraiter les données. Les champs textuels du CSV sont neutralisés contre l’interprétation en formules par un tableur.

Calculer l’empreinte sur les octets du fichier final, puis l’inscrire dans un manifeste séparé et dans un événement d’export. Ne pas insérer l’empreinte du fichier à l’intérieur de ce même fichier après calcul. L’empreinte vérifie une intégrité par rapport à une référence fiable ; elle ne constitue pas une signature. Toute signature ultérieure exige une clé identifiée et une procédure de vérification. Employer « historique vérifiable », sans valeur juridique automatique promise.

## 13 Fonctionnement hors connexion et notifications

### Comportement visible
La lecture hors connexion porte uniquement sur les données déjà synchronisées et autorisées. L’écran affiche la date de dernière synchronisation et avertit qu’une validation ou un rôle peut avoir changé. Les brouillons locaux portent la mention « enregistré sur cet appareil » ; aucun brouillon n’est présenté comme une déclaration acceptée.

Au pilote, la validation, le vote, l’acceptation de règles et les changements de rôle exigent le serveur. Une déclaration préparée hors connexion est soumise au retour du réseau ; le serveur contrôle à nouveau droits, règles et montant restant. Les dates du téléphone ne peuvent pas antidater une décision.

### Reprise et conflits
Chaque commande conserve son identifiant de requête jusqu’à un résultat certain. Après interruption réseau, le client recherche ou rejoue la commande avec la même clé. Un conflit de version demande le rechargement et une nouvelle confirmation humaine, jamais un écrasement automatique. Le nombre de tentatives est borné et l’erreur reste visible.

Le cache d’une personne déconnectée est purgé. Sur appareil partagé, recommander le mode sans conservation locale. Un appareil hors ligne ne peut pas recevoir instantanément une révocation : limiter la durée du cache autorisé, prévoir un verrou local et expliquer ce risque résiduel. Aucun numéro complet, commentaire de litige ou justificatif sensible n’entre par défaut dans le cache.

### Notifications fiables
La notification interne est la source consultable de l’alerte. Les push externes évitent d’afficher montants, noms ou litiges sur un écran verrouillé. Une validation reste valide même si WhatsApp échoue. Une file de tâches applique les reprises, un identifiant de déduplication et un état de livraison ; une file d’échec déclenche une action du support.

Les rappels WhatsApp automatiques sont une extension P1, après vérification du fournisseur, des règles de consentement et du coût. Le pilote peut proposer un lien à partager manuellement. Les notifications de sécurité restent accessibles gratuitement dans l’application ; ne pas promettre un canal externe illimité. Le refus des rappels commerciaux ne doit pas retirer les informations nécessaires au service.

## 14 Sécurité et objectifs non fonctionnels

### Contrôles prioritaires
Vérifier chaque lecture et mutation côté serveur. Les tests d’isolation couvrent aussi exports, tâches asynchrones, invitations, cache et recherche. La politique de base de données par ligne est une défense supplémentaire, pas un remplacement du contrôle métier. Les rôles administrateurs techniques ne doivent pas être utilisés par les requêtes ordinaires.

Prévoir mots de passe robustes, liste de mots de passe compromis, limitation d’essais et sessions révocables. La récupération utilise un jeton à usage unique expirant et ne révèle pas l’existence d’un compte. Une récupération sensible révoque les sessions et suspend temporairement les actions privilégiées selon un délai documenté. Le minimum de 12 caractères issu de l’audit est un plancher de projet à revoir dans la politique d’authentification ; il n’est pas présenté comme une certification.

Pour le web : cookies Secure, HttpOnly et SameSite, protection CSRF adaptée, politique de contenu et transport HTTPS. Pour un client natif : stockage sécurisé des jetons. Les secrets sont séparés des clients, des dépôts et des journaux. Les pièces, si activées ultérieurement, sont privées, limitées, analysées et accessibles par lien expirant après autorisation.

| Objectif proposé | Mesure et preuve |
|---|---|
| Disponibilité 99,5 % par mois | Sondes et incidents documentés ; environ 3 h 36 min d’indisponibilité sur 30 jours |
| API p95 sous 700 ms | Temps serveur sur routes et charge convenues ; réseau mesuré séparément |
| Parcours mobile utilisable | Essais sur téléphones du pilote et réseau dégradé documenté |
| RPO au plus 24 h | Écart maximal entre dernière sauvegarde récupérable et incident |
| RTO au plus 8 h | Exercice chronométré jusqu’au retour utile du service |
| Traçabilité complète | Toute mutation métier validée associée à son événement |
| Accessibilité | Contraste, navigation, taille de texte, erreurs et lecteurs d’écran testés |

Cible de vérification : OWASP ASVS 5.0.0 niveau 2 [R3], avec un périmètre et les exigences applicables documentés. Ni un scanner automatique ni un test d’intrusion isolé ne prouve la conformité totale. Une faille critique d’accès ou d’intégrité bloque l’utilisation de données réelles.

## 15 Données personnelles et dossier de conformité

### État du dossier
La loi camerounaise n°2024/017 du 23 décembre 2024 relative à la protection des données personnelles est publiée par la Présidence [R1]. Le dossier proposé organise le travail de conformité ; il ne conclut pas que KÓMBE est déjà conforme. La qualification des traitements, les formalités, transferts et délais légaux doivent être confirmés pour l’entité et les prestataires réellement retenus.

| Traitement | Données minimales proposées | Accès principal |
|---|---|---|
| Identité et récupération | Nom d’usage, canal vérifié, état du compte | Utilisateur et identité technique |
| Gestion du groupe | Adhésion, fonction, acceptation des règles | Membres du groupe selon périmètre |
| Registre | Montants, dates, références minimisées, validations | Participants autorisés |
| Litiges | Objet, parties, faits utiles, décision | Parties et responsables indépendants |
| Assistance | Ticket, contexte technique utile | Support habilité pour durée limitée |
| Mesure produit | Événements agrégés ou pseudonymisés | Produit ; sans montants ni références |

### Minimisation et conservation
Pas de CNI, relevé bancaire, capture de transaction ou document médical au pilote. Préférer la référence saisie et une confirmation humaine. L’historique de 90 jours de l’offre gratuite est une limite commerciale à revoir, pas une autorisation de supprimer les preuves d’un cycle actif.

Proposition de durées techniques à faire valider : invitations expirées 30 jours, journaux techniques expurgés 30 jours, tickets clôturés 6 mois, sauvegardes glissantes 30 jours. Pour le registre nominatif, proposer une conservation couvrant le cycle et 12 mois après clôture, puis une revue d’effacement ou d’anonymisation ; ce délai est une hypothèse de produit, non une durée légale. Tout gel pour litige possède une justification et une date de réexamen.

Les identités sont séparées du journal pour permettre une limitation ciblée. La suppression n’est pas un simple événement : elle doit traiter les tables identifiantes, fichiers, index, caches et copies selon leur cycle de vie. Après restauration, réappliquer les demandes d’effacement avant réouverture.

Avant lancement : renseigner l’éditeur, le contact, les finalités et bases applicables, les prestataires, les pays, les durées et le canal de réclamation. Les projets de textes joints sont rédigés mais restent non publiables tant que ces données factuelles et la revue locale ne sont pas complétées.

## 16 Guide des membres et administrateurs

### Créer et démarrer un groupe
L’administrateur choisit le modèle rotatif, saisit montant, fréquence et membres, puis vérifie le calendrier et l’ordre. Il nomme le trésorier, le contrôleur éventuel et les remplaçants. L’application affiche un récapitulatif des engagements ; les invitations sont envoyées après contrôle. Le cycle commence lorsque chaque membre a accepté les règles.

### Déclarer et vérifier une cotisation
Le membre ouvre son échéance, indique le versement effectué hors application, vérifie le montant et confirme la déclaration. L’écran affiche « en attente de confirmation ». Le trésorier vérifie ce qu’il a réellement reçu puis confirme ou rejette avec motif. Le contrôleur intervient si prévu. Le membre retrouve les personnes ayant agi et l’état exact de sa cotisation.

### Corriger une erreur
Avant soumission, modifier le brouillon. Après soumission, demander le rejet ou ouvrir une contestation selon l’état. Après validation, demander une correction ; l’historique conserve l’écriture initiale, sa compensation et la nouvelle déclaration. Il n’existe pas de bouton permettant d’effacer silencieusement une cotisation validée.

### Préparer une réunion
Le secrétaire affiche les échéances, validations en attente, retards, propositions et litiges. La vue commune ne révèle pas les justificatifs privés. Le groupe vérifie le rapprochement, la réception du bénéficiaire et les actions restantes. Le compte rendu cite les événements utiles et ne remplace pas les votes requis.

### Consulter et partir
Chaque membre accède aux règles acceptées, à son historique et aux relevés autorisés. Une demande de départ déclenche une revue de ses obligations et droits d’accès. La fin de l’abonnement ne doit pas empêcher de récupérer son historique personnel ou de contester une erreur selon la procédure.

### Vocabulaire de l’interface
« Déclaré » signifie saisi par une personne ; « confirmé » signifie reconnu par le confirmateur ; « validé » signifie que le circuit prévu est terminé. « Levée » désigne la somme attribuée au bénéficiaire d’un tour. « Compte utilisateur » est autorisé ; « compte de paiement KÓMBE » ne correspond pas au périmètre du pilote. Présenter le solde comme « écart du registre » lorsqu’il ne représente pas une somme détenue par le service.

Le parcours doit rester lisible avec une seule action principale par écran, des montants séparés des statuts et une confirmation explicite avant toute action engageante.

## 17 Exploitation et gestion des incidents

### Mise en production
Préparer des environnements distincts, des migrations versionnées, une sauvegarde vérifiée, les secrets nécessaires et un plan de retour arrière. La recette doit porter sur la version exacte à déployer. Activer le pilote par liste de groupes autorisés ; vérifier ensuite inscription, consultation, déclaration, export et livraison des alertes sur des données de test.

Une migration de données irréversible n’est pas annulée à l’aveugle. Privilégier des changements compatibles avec l’ancienne et la nouvelle version, puis une correction contrôlée. Une régression du journal exige une réconciliation avant reprise des écritures.

### Incident critique
1. Déclarer l’incident, désigner un responsable et consigner l’heure de détection.
2. Contenir : suspendre la fonction ou les écritures touchées, révoquer les accès compromis et préserver les traces.
3. Évaluer les groupes, données et versions concernés sans diffuser de données sensibles dans le canal d’équipe.
4. Restaurer en environnement isolé ou corriger ; vérifier journal, totaux, droits et commandes potentiellement rejouées.
5. Informer les utilisateurs touchés et déclencher la revue des notifications réglementaires applicables.
6. Réouvrir après validation technique et métier ; rédiger un retour d’expérience et suivre les corrections.

| Niveau | Exemple | Objectif interne proposé |
|---|---|---|
| S1 critique | Fuite intergroupe, altération, perte d’accès générale | Prise en charge sous 1 h pendant la couverture organisée |
| S2 majeur | Validation bloquée pour plusieurs groupes | Prise en charge sous 4 h ouvrées |
| S3 courant | Question de paramétrage, défaut d’affichage | Réponse sous 1 jour ouvré |

Ces délais ne sont pas un SLA commercial tant que l’équipe n’a pas organisé sa couverture. Publier les horaires réels et un canal d’urgence ; ne pas promettre un support permanent sans capacité.

### Sauvegarde et continuité
Exécuter une sauvegarde chiffrée chaque jour, protéger les clés séparément et vérifier les alertes d’échec. Restaurer avant G0 puis régulièrement dans un environnement isolé. Comparer les séquences et totaux, vérifier les droits et réappliquer les suppressions. Avec un RPO de 24 h, une perte récente reste possible : le pilote doit connaître cette limite et prévoir un rapprochement avec les traces du groupe.

## 18 Plan de recette et critères de livraison

La recette utilise des comptes et groupes fictifs, puis un scénario terrain observé. Les scénarios négatifs comptent autant que le parcours nominal. Les résultats seront consignés avec version, date, environnement, exécutant et preuve. Aucun des tests ci-dessous n’a été exécuté sur KÓMBE dans cette mission documentaire.

| Test | Situation | Résultat attendu |
|---|---|---|
| T01 | Membre A appelle un objet du groupe B | Aucun contenu ni action autorisée |
| T02 | Même déclaration rejouée après coupure | Une seule déclaration et un seul effet |
| T03 | Deux validations concurrentes | Un effet unique ; conflit contrôlé si version dépassée |
| T04 | Trésorier confirme sa propre déclaration | Refus ; suppléant requis |
| T05 | Versements de 2 000 puis 3 000 sur dette de 5 000 | Dette couverte à 5 000 après validations |
| T06 | Versement excédant le restant dû | Refus sans écriture partielle |
| T07 | Correction d’une validation | Original, compensation et remplacement reliés |
| T08 | Contestation après validation | Historique conservé ; clôture dépendante bloquée |
| T09 | Vote avec départ d’un membre | Électorat initial conservé ou nouveau vote explicite |
| T10 | Vote reçu après échéance | Refus fondé sur l’heure serveur |
| T11 | Commande locale d’un rôle révoqué | Refus à la synchronisation |
| T12 | Échec de WhatsApp | Validation conservée ; notification interne et reprise |
| T13 | Export puis modification d’un octet | Empreinte différente du manifeste |
| T14 | Restauration puis demande d’effacement antérieure | Demande réappliquée avant accès |
| T15 | Clôture avec écart ou litige ouvert | Clôture normale refusée |
| T16 | Export d’un ancien membre | Seulement données auxquelles il conserve accès |

### Définition de terminé
Une fiche est terminée lorsque le comportement est implémenté, les critères applicables passent, les accès et erreurs sont testés, la documentation est mise à jour et une personne autre que l’auteur a revu le résultat. Une capture d’écran seule ne démontre pas l’idempotence ou la séparation des pouvoirs.

G0 exige tous les contrôles critiques, une restauration réussie, des notices factuellement complètes et un responsable de support. Les tests de charge préciseront le nombre de groupes, d’utilisateurs simultanés et d’opérations ; annoncer un p95 sans ce protocole ne suffit pas.

## 19 Protocole pilote et mesure

### Recrutement et temporalité
Recruter dix groupes existants par vagues de trois, trois puis quatre, après G0. Proposition de répartition : quatre groupes familiaux ou de quartier, trois de collègues et trois de commerçants pratiquant une rotation simple. Cette diversité teste la compréhension ; elle ne fournit pas une estimation statistiquement représentative du marché.

Une séance ou un tour n’est pas un cycle. Dix membres à fréquence hebdomadaire nécessitent dix tours pour un cycle ; trois cycles représentent environ trente semaines d’activité. À fréquence mensuelle, trois cycles durent environ trente mois. Ne pas accélérer les engagements financiers des participants pour respecter un calendrier de produit.

Observer trois premiers tours pour repérer les blocages, puis un cycle complet pour tester le renouvellement et le prix. Réserver la décision exigeant trois cycles aux groupes qui les ont réellement terminés. Le consentement de recherche est séparé de l’usage normal ; la compensation éventuelle concerne le temps d’entretien, pas la cotisation ni une réponse positive.

| Indicateur | Définition proposée | Seuil exploratoire |
|---|---|---|
| Activation | Invités uniques ayant accepté et agi sous 7 jours / invités uniques éligibles | Au moins 70 % |
| Complétude | Obligations arrivées à échéance avec état final / obligations arrivées à échéance | Au moins 90 % |
| Délai de validation | Temps serveur entre déclaration et validation | Médiane sous 24 h ; p90 sous 72 h |
| Litiges | Déclarations contestées au moins une fois / déclarations soumises de la cohorte | Moins de 2 % |
| Rétention | Groupes de la cohorte poursuivant l’usage après trois cycles achevés / groupes ayant eu le temps de les achever | Au moins 60 % |
| Paiement réel | Groupes ayant payé / groupes éligibles ayant reçu l’offre | Au moins 25 % |
| Assistance | Tickets et minutes par groupe actif, par mois | Moins de 1 ticket en régime stabilisé |

Les seuils viennent des sources ou sont opérationnalisés ici ; ils ne sont pas des résultats obtenus. Sur dix groupes exposés à une offre, 25 % signifie au moins trois payeurs. Toujours publier les nombres bruts. Une faible contestation peut aussi signaler une difficulté à se plaindre : interroger les membres silencieux.

## 20 Offre commerciale et économie unitaire

### Tarifs à expérimenter
Les prix des sources sont des hypothèses : découverte gratuite, groupe à 1 500 XAF par mois ou 15 000 par an, association à 5 000 par mois pour cinq groupes. Ne pas afficher ces tarifs comme définitivement validés. Tester l’offre après un cycle utile, avec le même contenu et une explication transparente de l’expérimentation.

Proposition : préserver gratuitement les règles acceptées, les fonctions de contestation et un export de base du cycle. Faire payer les rappels externes sous quota, la consolidation, les exports avancés et l’accompagnement. Une coupure d’abonnement ne doit pas rendre illisible l’historique indispensable d’un groupe engagé.

### Calculer la contribution à la marge
Exemple purement budgétaire : à 1 500 XAF par mois, avec 150 XAF de messages, 100 XAF d’infrastructure variable et 300 XAF de support, la contribution à la marge vaut 950 XAF par groupe avant frais d’encaissement de l’abonnement, taxes, impayés et charges fixes. À 15 000 XAF par an, le revenu mensuel reconnu est 1 250 XAF ; avec les mêmes coûts, la contribution tombe à 700 XAF.

| Groupes payants au tarif mensuel | Revenu mensuel | Contribution avant charges fixes |
|---|---|---|
| 30 | 45 000 XAF | 28 500 XAF |
| 120 | 180 000 XAF | 114 000 XAF |
| 500 | 750 000 XAF | 475 000 XAF |
| 1 000 | 1 500 000 XAF | 950 000 XAF |

Avec 500 000 XAF de charges fixes mensuelles et 950 XAF de contribution par groupe, il faut au moins 527 groupes payants pour couvrir ces charges, avant les autres coûts mentionnés. Un budget d’acquisition de 6 000 XAF par groupe demanderait environ 6,3 mois de contribution pour être récupéré, sans attrition. Ces calculs illustrent une méthode, pas une prévision de rentabilité.

### Frais externes
Le CGI 2026 donne un exemple de taxe de 24 XAF sur un transfert mobile de 10 000 XAF ; il distingue aussi certaines opérations bancaires [R5]. Ne pas appliquer automatiquement « 0,2 % + 4 XAF » à tous les canaux. En V1, documenter les frais déclarés ; ne pas calculer ou prélever un tarif de paiement KÓMBE.

## 21 Budget de validation et propositions de développement

### Reconstituer les enveloppes
L’audit annonce 4 à 10 millions XAF pour durcir et piloter un MVP déjà financé. Son tableau annuel « registre seul » totalise précisément 12,1 à 38 millions XAF. Le supplément « paiement » atteint 25,5 à 71 millions, soit 37,6 à 109 millions avec le registre si les postes ne se recouvrent pas. L’autre chiffre de 18 à 45 millions n’est pas directement réconciliable : il doit être retiré comme budget de référence avant devis.

| Poste du pilote proposé | Enveloppe indicative |
|---|---|
| Revue du MVP, corrections et QA | 2 500 000 XAF |
| Sécurité et test externe | 800 000 XAF |
| Revue juridique et données | 500 000 XAF |
| Recrutement, formation et support terrain | 600 000 XAF |
| Hébergement et messages | 200 000 XAF |
| Réserve | 400 000 XAF |
| Total proposé | 5 000 000 XAF |

Cette enveloppe est une allocation interne illustrative, pas un devis du marché. Elle suppose un MVP réutilisable et une participation fondatrice déjà financée. Si ces conditions ne sont pas réunies, réduire le pilote ou obtenir du financement avant d’engager des dépenses de développement supplémentaires.

### Propositions prioritaires
P01 — Faire de la réunion de tontine le moment central : un écran résume validations en attente, désaccords, prochain bénéficiaire et tâches. Tester s’il réduit d’au moins 30 % le temps de rapprochement observé sur trois réunions.

P02 — Proposer une installation accompagnée forfaitaire aux associations, distincte de l’abonnement. Le prix sera construit sur le temps réel de configuration et de formation. Aucun commercial ne collecte les cotisations du groupe.

P03 — Tester un groupe financé par une association ou un employeur : le financeur paie les licences mais n’accède pas aux registres individuels par défaut. Obtenir trois entretiens avec décideurs et une offre payée avant de développer une console dédiée.

P04 — Utiliser l’export imprimable comme outil d’adoption, puis mesurer le passage du cahier au registre. P05 — Limiter chaque rappel externe par quota et suivre la marge par groupe. P06 — Préférer des partenariats apportant des groupes identifiés à une campagne publicitaire large avant rétention démontrée.

## 22 Assistant local et innovations futures

### Corriger les promesses de la note IA
La note source confond taille des poids, taille du téléchargement et mémoire à l’exécution. À quatre bits, 100 Mo correspondent théoriquement à 200 millions de paramètres bruts, avant métadonnées et autres composants ; cela ne démontre aucune qualité en français. Google décrit Gemma 3n E2B avec plus de cinq milliards de paramètres en exécution standard et environ 1,91 milliard de paramètres effectifs avec optimisations [R4]. Le dossier ne retient donc pas une promesse Gemma de 100 Mo.

Les chiffres « 80 % des questions », « 3 % du risque », « coût nul » et « classifieur de 2 Mo sur tous téléphones » ne sont pas des résultats de mesure. Les durées de six à huit semaines puis huit à douze semaines sont des estimations source à recalibrer selon l’équipe, le matériel et la qualité attendue.

### Première solution proposée
Après G1, créer une aide déterministe : intentions simples, requêtes autorisées et réponses modèles. Exemples : prochaine échéance, règle de retard, état de ma déclaration, procédure de contestation. Un résultat cite les événements ou la version de règles utilisée et la date de dernière synchronisation. Les montants sont calculés par le moteur métier, pas par un modèle de langage.

### Conditions pour une génération de texte
Le module n’a aucun droit d’écriture, de vote, de notification à autrui ou de paiement. Il ne reçoit que les données autorisées pour la personne et le groupe ; l’isolation doit inclure les commentaires et périodes d’adhésion, pas seulement group_id. Les noms et textes récupérés sont traités comme données non fiables. Un filtre par expressions régulières n’est pas une garantie contre l’invention : vérifier une sortie structurée contre les faits ou utiliser une réponse déterministe.

### Recette et budget matériel
Constituer un jeu de questions consenties et expurgées, séparé entre entraînement et test, couvrant français, anglais, vocabulaire local, ambiguïtés et demandes hors périmètre. Mesurer exactitude des chiffres, pertinence, refus, fuites, latence, stockage, RAM et batterie sur appareils réels. Exiger zéro fuite et zéro chiffre inventé sur la suite critique avant bêta ; cela ne prouve pas une absence universelle d’erreur. Si le budget matériel échoue, garder les réponses modèles.

## 23 Feuille de route et portes de contrôle

### Plan à partir du démarrage effectif
Les lots désignent un ordre de travail proposé, pas une promesse de livraison. La revue du dépôt et la capacité de l’équipe détermineront les estimations. La durée réelle des cycles des groupes reste indépendante du planning technique.

| Lot | Travail prioritaire | Dépendance et preuve |
|---|---|---|
| A cadrage | Revue du MVP, doctrine registre, rôles, données, budget | Décisions D01 à D08 et estimation |
| B intégrité | Journal, règles, montants, validation, corrections, litiges | T01 à T10 et rapprochement |
| C exploitation | Récupération, export, sauvegarde, alertes, notices | Restauration, revue de sécurité, support prêt |
| D pilote | Vagues de groupes, formation, trois tours observés | Journal d’observation et coûts réels |
| E rétention | Cycle complet, prix, renouvellement, assistance | Paiements et cohortes datées |
| F extension | Association, rappels, aide locale éventuelle | Demande payante et marge soutenable |

### Portes harmonisées
G0 autorise les données réelles après fermeture des risques critiques, acceptation des règles, dossier de données complet, recette et restauration. Un prototype sur données fictives peut précéder G0.

G1 autorise une extension contrôlée après complétude d’au moins 90 %, usage autonome démontré, incidents maîtrisés et au moins un cycle complet pour la cohorte évaluée. Il s’agit d’un arbitrage proposé, plus précis que la définition initiale ; suivre séparément la rétention à trois cycles, sans prétendre la connaître avant.

G2 confirme la monétisation lorsque 25 % au moins des groupes éligibles paient effectivement l’offre testée. G3 exige, en plus des conditions juridiques et techniques du paiement, au moins 30 groupes actifs, trois cycles complets observés et une rétention d’au moins 60 %. Le taux de saisie sans support attendu avant paiement est d’au moins 95 %, avec litiges inférieurs à 2 % et résolution médiane sous 48 h.

G4 autorise une croissance plus large lorsque la contribution à la marge est positive, le coût d’acquisition récupérable, le support finançable et les incidents maîtrisés. Les perspectives de scoring, assurance ou crédit nécessitent un dossier séparé ; une porte paiement franchie ne les autorise pas automatiquement.

## 24 Décisions et risques à suivre

Les décisions suivantes sont proposées et non encore approuvées par le porteur du projet. Le rôle responsable doit être associé à une personne avant exécution. Chaque décision validée conserve sa date, son motif et les documents modifiés.

| ID | Décision attendue | Responsable proposé |
|---|---|---|
| D01 | Adopter registre seul et rotation simple pour G0 | Direction produit |
| D02 | Confirmer la stack et la réutilisation du MVP après revue | Responsable technique |
| D03 | Adopter le circuit de validation et ses suppléants | Produit et représentants pilotes |
| D04 | Adopter quorum figé et règles de modification | Produit et groupes |
| D05 | Valider minimisation, durées et prestataires | Responsable données et conseil local |
| D06 | Approuver moyens de support et critères de sécurité | Direction et technique |
| D07 | Choisir fréquence et groupes sans modifier artificiellement les cycles | Responsable terrain |
| D08 | Valider budget et prix expérimentaux | Direction |

| Risque prioritaire | Mesure prévue | Preuve à obtenir |
|---|---|---|
| Accès intergroupe | Autorisation serveur et isolation | Recette T01 et revue externe |
| Historique altéré | Événements, compensation, contrôle des accès | Reconstruction et détection d’écart |
| Fausse assurance des fonds | Messages, formation, notices | Test de compréhension membre |
| Collusion | Indépendance, visibilité, contestation | Scénarios adverses et entretiens |
| Support trop coûteux | Mesure des minutes, parcours simplifié | Coût mensuel par groupe |
| Faible paiement réel | Offre après bénéfice démontré | Encaissements d’abonnements |
| Perte de données | Sauvegarde et reprise | Rapport de restauration |
| Conservation excessive | Inventaire et purge contrôlée | Exécution documentée des droits |

Prochaine séquence recommandée : obtenir le dépôt et une démonstration authentifiée ; attribuer les responsabilités ; adopter le périmètre ; estimer le lot B ; préparer les groupes et la recette ; déclencher G0 seulement avec les preuves requises. Une documentation complète aide à construire et vérifier le service, mais ne prouve pas que le produit est prêt.

## 25 Sources et traçabilité

### Documents transmis et conservés
S1 — Texte collé.txt : inventaire des 17 modules et fonctionnalités. Repris dans la couverture et le backlog.

S2 — 6684c32b-c83d-4e8f-b229-be48cfb24fea.txt : étude de conception de l’IA locale. Architecture hybride conservée comme perspective ; tailles, garanties et calendrier corrigés.

S3 — a04e894a-c7b1-4195-943b-7f7c6f9cdcaf.md : 105 fiches de backlog et 5 perspectives. Identifiants conservés, critères harmonisés et nouvelles fiches ajoutées.

S4 — 9e89fd11-d848-4034-a096-ba7620654815.docx : étude des tontines camerounaises. Typologies, dimensions sociales, risques et pistes de partenariat synthétisés. Les nombreuses références bibliographiques historiques restent dans l’original ; celles pointant seulement vers une page d’accueil nécessitent une résolution avant nouvelle publication scientifique.

S5 — 063cfbfa-b55a-4d43-a3ea-e0c18ae049d7.pdf : audit boîte noire KÓMBE v1 du 13 septembre 2026, 18 pages. Verdict, hypothèses économiques, risques et portes repris avec corrections explicites. Les notes de cet audit ne sont pas de nouvelles mesures de sécurité.

### Vérifications externes ciblées du 14 septembre 2026
[R1] Présidence du Cameroun — page officielle intitulée Loi n°2024/017 relative à la protection des données personnelles. Existence du texte confirmée ; conformité propre à KÓMBE non évaluée. Lien complet dans Documentation/Sources_et_modifications.md.

[R2] BEAC — Règlement n°04/18 du 21 décembre 2018 relatif aux services de paiement. Texte officiel consultable : www.beac.int, rubrique Systèmes de paiement, Instructions, circulaires et règlements. Qualification de l’activité à confirmer pour le montage retenu.

[R3] OWASP — Application Security Verification Standard, version stable 5.0.0 indiquée sur la page officielle. Référence : https://owasp.org/www-project-application-security-verification-standard/

[R4] Google — Gemma 3n model overview, paramètres standards et effectifs. Référence : https://ai.google.dev/gemma/docs/gemma-3n

[R5] Direction générale des impôts du Cameroun — CGI 2026, article 228 quinquies et illustrations des transferts, pages PDF 145 et 988. Les tarifs ne sont pas transposés sans distinction à tous les canaux.

Les liens complets, la carte des modifications et les empreintes des cinq fichiers originaux sont joints. Les recommandations nouvelles sont des choix de conception et des hypothèses à tester, non des résultats de terrain ni des avis professionnels déjà obtenus.
