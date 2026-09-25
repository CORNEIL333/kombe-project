# Backlog KÓMBE v2 — User stories et critères de recette

*Version proposée du 14 septembre 2026. Aucun état de réalisation vérifié. Dérivé de l'inventaire fonctionnel (17 modules, 110 entrées historiques) et de l'audit stratégique. Organisation par Epic (= module). Chaque story porte le numéro de référence de l'inventaire, sa priorité (P0/P1/P2/V2) et des critères d'acceptation testables.*

**Légende priorité** : P0 = indispensable au pilote · P1 = avant extension · P2 = différenciation · V2 = après portes de contrôle (G3/G4)

---

## EPIC 1 — Compte & Authentification

### 1.1 Inscription — *P0*
**En tant que** visiteur, **je veux** créer un compte par email ou téléphone, ou découvrir l'app en mode invité, **afin de** rejoindre ou créer une tontine sans friction.
- [ ] Le canal choisi, email ou téléphone, est vérifié par un jeton ou code à usage unique expirant avant activation.
- [ ] Un invité ne manipule que des données de démonstration ou un brouillon privé ; aucun accès à un registre réel.
- [ ] Les réponses d’inscription et récupération ne permettent pas d’énumérer les comptes ; limiter les tentatives.
- [ ] Les conditions d’utilisation et la notice sont accessibles avant acceptation.

### 1.2 Authentification — *P0*
**En tant qu'**utilisateur, **je veux** un mot de passe robuste et des sessions maîtrisées, **afin de** protéger mon compte contre le vol d'identifiants.
- [ ] Politique d’authentification approuvée ; minimum projet de 12 caractères issu de l’audit, à revoir selon le mécanisme retenu, contrôle des mots de passe compromis et limitation des essais.
- [ ] Sessions actives consultables et révocables ; stockage des secrets conforme au client web ou natif.
- [ ] Aucun mot de passe, OTP ou jeton dans les logs ou exports.

### 1.3 Authentification forte — *P1*
**En tant qu'**utilisateur soucieux de sécurité, **je veux** activer une authentification forte optionnelle, **afin de** réduire le risque de prise de compte.
- [ ] Passkey ou TOTP activable en option dans les paramètres de sécurité
- [ ] Détection d'un nouvel appareil déclenche une vérification additionnelle
- [ ] Fonctionnalité non bloquante pour les utilisateurs qui ne l'activent pas

### 1.4 Récupération de compte — *P0*
**En tant qu'**utilisateur ayant perdu l'accès à son compte, **je veux** une procédure de récupération sécurisée, **afin de** ne pas perdre l'accès à l'historique de ma tontine.
- [ ] Flux "mot de passe oublié" fonctionnel (actuellement absent du MVP)
- [ ] Vérification d'identité avant réinitialisation (OTP ou lien à usage unique expirant)
- [ ] Toutes les sessions existantes révoquées après réinitialisation
- [ ] Notification envoyée sur le canal vérifié en cas de récupération

### 1.5 Profil utilisateur — *P0*
**En tant qu'**utilisateur, **je veux** gérer mon identité et appartenir à plusieurs groupes, **afin de** représenter fidèlement ma participation aux tontines.
- [ ] Nom d’usage, canal vérifié, langue et état sont gérables ; avatar optionnel, sans obligation de CNI.
- [ ] Le modèle accepte plusieurs adhésions ; la vue consolidée avancée relève de 2.5.
- [ ] Les changements sont tracés sans dupliquer inutilement les anciennes données personnelles dans un journal permanent.

### 1.6 Préférences — *P1*
**En tant qu'**utilisateur, **je veux** paramétrer mes canaux de notification, fuseau et devise, **afin de** recevoir l'information au bon moment et dans le bon format.
- [ ] Préférences par type d’alerte et canal avec consentement requis selon le canal.
- [ ] Langue personnelle configurable ; devise du groupe immuable pendant un cycle et non convertie par une préférence utilisateur.
- [ ] Fuseau affiché explicitement ; le serveur conserve les instants UTC et les échéances métier du groupe.

## EPIC 2 — Groupe (Tontine)

### 2.1 Création de groupe — *P0*
**En tant que** fondateur, **je veux** créer un groupe avec ses paramètres de base, **afin de** démarrer une tontine adaptée à mon contexte.
- [ ] Groupe créé en configuration avec nom, type rotatif, XAF et Africa/Douala au pilote.
- [ ] Le fondateur prépare les règles ; le cycle ne démarre qu’après acceptation des membres et attribution des validateurs indépendants.
- [ ] Les droits sur tout objet sont vérifiés côté serveur.

### 2.2 Modèles de tontine — *P0*
**En tant que** fondateur, **je veux** partir d'un modèle préconfiguré, **afin de** réduire le temps de paramétrage.
- [ ] Modèles disponibles : famille, collègues, fêtes, construction, étudiant, personnalisé
- [ ] Sélection d'un modèle pré-remplit les règles par défaut, modifiables avant validation
- [ ] Modèle "personnalisé" permet de partir d'une page vierge

### 2.3 Typologies supportées — *P0/P1*
**En tant que** fondateur, **je veux** choisir le type de rotation de ma tontine, **afin de** refléter les règles réelles de mon groupe.
- [ ] P0 : rotation fermée, cotisation égale, une part par membre, ordre fixé avant cycle.
- [ ] P1 : tirage auditable ou ordre négocié sans enchère financière après décision produit et recette dédiée.
- [ ] Les enchères, prêts, accumulation et plusieurs parts ne sont pas activables dans le pilote, même via API.

### 2.4 Hors périmètre explicite — *N/A (garde-fou produit)*
**En tant qu'**équipe produit, **je veux** bloquer par design les fonctionnalités de type caisse de crédit, **afin de** ne pas exposer KÓMBE à une requalification en service financier réglementé.
- [ ] Aucune fonctionnalité ASCA/caisse cumulative accessible dans l'UI
- [ ] Aucune fonctionnalité de prêt interne ou caisse de crédit accessible
- [ ] Tentative de contournement (ex. via l'API) rejetée côté serveur, pas seulement côté client

### 2.5 Multi-groupes — *P1*
**En tant qu'**utilisateur membre de plusieurs tontines, **je veux** une vue consolidée, **afin de** suivre tous mes engagements en un seul endroit.
- [ ] Liste de tous les groupes de l'utilisateur avec statut de chacun
- [ ] Vue consolidée des prochaines échéances tous groupes confondus
- [ ] Bascule rapide entre groupes sans perte de contexte

### 2.6 Offre Association — *P2*
**En tant qu'**administrateur d'association, **je veux** gérer jusqu'à 50 groupes avec des rôles avancés, **afin de** superviser un portefeuille de tontines.
- [ ] Offre d’entrée proposée pour cinq groupes ; aucune extension à cinquante sans validation de capacité et de prix.
- [ ] Le payeur d’une association ne voit pas automatiquement les données de tous ses groupes.
- [ ] Reporting consolidé filtré par permissions et période d’adhésion.

### 2.7 Statut du groupe — *P0*
**En tant que** membre, **je veux** voir le statut réel du groupe, **afin de** savoir si je dois encore agir.
- [ ] États : configuration, actif, en pause, clôturé, arrêté avec écarts, archivé.
- [ ] Les transitions contrôlent les obligations, litiges, droits et motifs.
- [ ] Clôturé ou archivé est en lecture seule ; arrêté avec écarts conserve les obligations non résolues.

### 2.8 Clôture de groupe — *P0*
**En tant que** trésorier ou fondateur, **je veux** clôturer un groupe proprement, **afin de** obtenir un historique final vérifiable.
- [ ] Clôture normale seulement après rapprochement sans écart et absence de litige bloquant.
- [ ] L’arrêt exceptionnel conserve les écarts et ne se présente jamais comme une clôture équilibrée.
- [ ] Export final avec manifeste d’empreinte ; ne pas appeler cela une signature sans dispositif de signature réel.

## EPIC 3 — Règles (Rules Engine)

### 3.1 Paramètres financiers — *P0*
**En tant que** fondateur, **je veux** définir montant, fréquence, nombre de membres et nombre de tours séparément, **afin d'**éviter toute ambiguïté sur le calcul du pot.
- [ ] Nombre de membres N et tours T explicitement affichés ; pilote une part par membre impose T = N.
- [ ] Cotisation positive en entier XAF ; pot théorique N × c, cycle N × c × T.
- [ ] Totaux attendu, déclaré, validé, contesté et restant dû distincts ; volume de cotisations jamais assimilé au chiffre d’affaires.

### 3.2 Paramètres de cycle — *P0*
**En tant que** fondateur, **je veux** fixer les dates et l'ordre des bénéficiaires, **afin de** cadrer le déroulement du cycle.
- [ ] Début, fréquence, nombre de tours et règle de fin de mois génèrent un calendrier prévisualisé.
- [ ] Ordre fixe accepté en P0 ; ordre négocié et tirage reportés avec périmètre distinct.
- [ ] Une nouvelle règle ne réécrit aucune échéance passée.

### 3.3 Pénalités — *P0*
**En tant que** membre, **je veux** que les pénalités soient des règles versionnées et acceptées, jamais des valeurs imposées par le code, **afin de** garantir l'équité et la transparence.
- [ ] Les pénalités sont désactivées par défaut au pilote.
- [ ] Pour activation ultérieure : montant, plafond, grâce, destination, conditions et version sont explicites et acceptés.
- [ ] Le calcul est déterministe et séparé de la contribution ; aucune sanction de défaut personnelle décidée automatiquement.

### 3.4 Période de grâce — *P1*
**En tant que** membre, **je veux** disposer d'un délai de tolérance avant pénalité, **afin de** ne pas être sanctionné pour un retard mineur.
- [ ] Délai de grâce configurable par échéance ou par groupe
- [ ] Pénalité non déclenchée tant que le délai de grâce n'est pas dépassé
- [ ] Notification envoyée à l'approche de la fin du délai de grâce

### 3.5 Quorum — *P0*
**En tant que** groupe, **je veux** un quorum configurable selon le type de décision, **afin d'**adapter le niveau de consensus requis à l'importance de la décision.
- [ ] Définir quorum, dénominateur, arrondi, majorité, abstention, égalité, conflits d’intérêts et échéance.
- [ ] Électorat figé à l’ouverture ; aucune exécution avant clôture, quorum, majorité et acceptations nécessaires.
- [ ] Recette avec 10 électeurs : quorum deux tiers = 7 ; 4 oui, 2 non, 1 abstention approuvent ; 3 oui, 3 non, 1 abstention rejettent.

### 3.6 Versionnement des règles — *P0*
**En tant que** membre, **je veux** que chaque version de règles soit horodatée et acceptée individuellement, **afin de** garantir que personne n'est engagé par une règle qu'il n'a pas acceptée.
- [ ] Chaque modification produit une version et des acceptations horodatées.
- [ ] Engagements financiers essentiels : application au cycle suivant ; exception seulement avec acceptation de toutes les personnes concernées.
- [ ] Conservation motivée des anciennes versions et identités selon la politique de données, pas promesse de conservation nominative éternelle.

### 3.7 Modification des règles — *P0*
**En tant que** membre autorisé, **je veux** proposer une modification de règle soumise au vote, **afin de** faire évoluer le groupe démocratiquement.
- [ ] Proposition → vote → acceptations requises → date d’effet ; jamais de rétroactivité.
- [ ] Administration : prochain tour si permis par les règles ; engagement financier essentiel : cycle suivant par défaut.
- [ ] Refus d’acceptation bloque la modification concernée ; maintien de la règle courante ou sortie documentée.

### 3.8 Glossaire contextuel — *P1*
**En tant qu'**utilisateur, **je veux** un glossaire bilingue des termes locaux (njangi, tontine, levée...), **afin de** comprendre l'app dans mon vocabulaire habituel.
- [ ] Glossaire accessible depuis n'importe quel écran utilisant un terme technique ou local
- [ ] Contenu disponible en FR et EN
- [ ] Termes locaux (njangi, levée...) mappés à leur équivalent standard dans l'app

---

## EPIC 4 — Membres & Rôles (Governance Engine)

### 4.1 Invitation — *P0*
**En tant que** fondateur ou administrateur, **je veux** inviter des membres par lien ou WhatsApp, **afin de** constituer le groupe rapidement.
- [ ] Invitation par lien expirant, révocable et limité ; aucun registre réel exposé à l’invité.
- [ ] Canal vérifié et acceptation des règles avant participation.
- [ ] Arrivée pendant cycle prévue pour le cycle suivant, sauf procédure exceptionnelle explicitement adoptée.

### 4.2 Acceptation des règles — *P0*
**En tant que** nouveau membre, **je veux** accepter explicitement la version des règles en vigueur, **afin d'**être formellement engagé.
- [ ] Consentement horodaté enregistré à l'acceptation
- [ ] Version exacte des règles acceptée affichée et conservée
- [ ] Impossible de participer aux cotisations avant acceptation

### 4.3 Identité affichée — *P0*
**En tant que** membre, **je veux** voir le nom, le rôle et le statut de chaque membre, **afin de** savoir qui fait quoi dans le groupe.
- [ ] Nom, rôle et statut visibles par tous les membres du groupe (pas seulement les admins)
- [ ] Mise à jour immédiate après changement de rôle ou de statut

### 4.4 Rôles — *P0*
**En tant que** groupe, **je veux** une répartition de fonctions claire, **afin de** répartir les responsabilités.
- [ ] Rôles : membre, administrateur, trésorier, contrôleur, secrétaire ; fondateur administrateur initial sans superpouvoir.
- [ ] Cumuls soumis aux contraintes d’indépendance par opération.
- [ ] Au moins un suppléant prévu pour la cotisation du trésorier ; défaut de quorum humain bloque la validation.

### 4.5 Matrice d'autorisation — *P0*
**En tant qu'**équipe sécurité, **je veux** qu'aucun rôle ne puisse tout faire, **afin d'**empêcher la collusion et les abus de pouvoir.
- [ ] RBAC et contrôle d’objet côté serveur sur API, exports, jobs et caches.
- [ ] Déclarant et confirmateur sont deux personnes distinctes ; contrôleur requis distinct des deux.
- [ ] Support hors des rôles du groupe, aucun privilège de validation financière.
- [ ] La matrice du chapitre 7 et les cas de cumul sont testés.

### 4.6 Délégation — *P1*
**En tant que** trésorier absent, **je veux** déléguer temporairement mon rôle, **afin de** ne pas bloquer le fonctionnement du groupe.
- [ ] Délégation limitée dans le temps (date de fin obligatoire)
- [ ] Actions du délégué tracées avec mention explicite de la délégation
- [ ] Retour automatique au titulaire à l'échéance de la délégation

### 4.7 Exclusion d'un membre — *P1*
**En tant que** groupe, **je veux** pouvoir exclure un membre par vote, **afin de** gérer les cas de défaillance grave.
- [ ] Exclusion soumise à vote avec quorum dédié
- [ ] Position financière et dettes du membre exclu documentées et conservées dans le ledger
- [ ] Membre exclu conserve un accès en lecture seule à son propre historique

### 4.8 Départ volontaire — *P1*
**En tant que** membre, **je veux** quitter un groupe selon des règles claires, **afin de** partir sans litige.
- [ ] Règles de retrait définies par le groupe (remboursement, position dans le cycle, etc.)
- [ ] Calcul de la position financière du membre au moment du départ
- [ ] Départ tracé dans le journal d'événements

### 4.9 Changement de rôle — *P0*
**En tant qu'**administrateur, **je veux** que tout changement de rôle soit tracé et déclenche une alerte, **afin de** détecter les abus potentiels.
- [ ] Changement avec motif, proposant et approbateur distinct, date d’effet et notification.
- [ ] Les droits sont revérifiés au moment d’une commande, y compris après synchronisation.
- [ ] Le rôle nouveau ne modifie pas les fonctions historiques enregistrées dans les événements.

### 4.10 Statuts spéciaux — *P1*
**En tant que** groupe, **je veux** gérer les cas de défaut, décès ou incapacité d'un membre, **afin de** traiter ces situations sans bloquer le cycle.
- [ ] Retard calculé depuis échéance et grâce ; défaut personnel prononcé par une décision documentée.
- [ ] Défaut après levée signifie arrêt des cotisations après réception d’une levée, pas levée manquée.
- [ ] Décès ou incapacité : gel tracé, aucune désignation automatique d’héritier ni collecte médicale par défaut.

## EPIC 5 — Cycles & Échéances

### 5.1 Cycle — *P0*
**En tant que** fondateur, **je veux** créer un cycle avec calendrier et progression visible, **afin de** suivre l'avancement de la tontine.
- [ ] Calendrier par tours, chaque tour avec obligations et un bénéficiaire.
- [ ] Une part par membre au pilote : autant de tours que de membres ; champs néanmoins séparés et vérifiés.
- [ ] Progression par tours distincte du nombre de cycles achevés.

### 5.2 Échéance — *P0*
**En tant que** membre, **je veux** que chaque échéance soit clairement identifiée, **afin de** savoir exactement quoi payer, quand, et à qui.
- [ ] Chaque échéance a un identifiant unique
- [ ] Montant, date et bénéficiaire désigné affichés sans ambiguïté
- [ ] Échéance liée à une version précise des règles

### 5.3 Ordre des bénéficiaires — *P0*
**En tant que** groupe, **je veux** un ordre des bénéficiaires conforme au type de tontine choisi, **afin de** garantir l'équité de la rotation.
- [ ] P0 : ordre préétabli, accepté avant lancement et non modifiable par simple édition.
- [ ] Tirage auditable et négociation d’ordre sont P1, avec exigences de preuve et recette avant activation.
- [ ] Aucune enchère financière ni multi-part au pilote.

### 5.4 Changement de bénéficiaire — *P1*
**En tant que** groupe, **je veux** pouvoir changer un bénéficiaire désigné via une procédure votée, **afin de** gérer les imprévus sans rompre la confiance.
- [ ] Changement soumis à vote avec quorum
- [ ] Changement tracé (ancien bénéficiaire, nouveau, motif, date)
- [ ] Notification à tous les membres du changement

### 5.5 Renouvellement — *P1*
**En tant que** fondateur, **je veux** démarrer un nouveau cycle en reprenant les paramètres versionnés, **afin de** ne pas reconfigurer le groupe à chaque fois.
- [ ] Nouveau cycle créé à partir de la dernière version acceptée des règles
- [ ] Possibilité d'ajuster les paramètres avant validation du nouveau cycle
- [ ] Historique de l'ancien cycle conservé et accessible séparément

---

## EPIC 6 — Cotisations (Contributions)

### 6.1 Déclaration — *P0*
**En tant que** membre, **je veux** déclarer ma cotisation avec preuve, **afin d’**initier le processus de validation.
- [ ] Montant positif entier XAF, obligation, canal et date alléguée ; horodatage serveur séparé.
- [ ] Référence espèces facultative ; référence électronique demandée si disponible, absence explicitement justifiée.
- [ ] Pas de pièce jointe au pilote ; une référence ne prouve pas l’authenticité d’une transaction externe.
- [ ] Idempotence et contrôle sous verrou du restant dû ; paiements partiels permis, excédent bloqué.

### 6.2 Machine à états — *P0*
**En tant que** système, **je veux** faire transiter chaque cotisation par des états définis, **afin de** garantir une traçabilité complète et sans ambiguïté.
- [ ] Obligation attendue séparée des déclarations : déclarée → confirmée → validée ; rejet possible avant validation.
- [ ] Litige ouvert/résolu sur objet séparé ; une contestation ne supprime pas la validation historique.
- [ ] Compensation après validation par événement inverse lié à l’original.
- [ ] Chaque transition exige droits, version attendue, identité, date serveur et préconditions ; voir contrat technique.

### 6.3 Double/triple validation — *P0*
**En tant que** trésorier, **je veux** que la validation d'une cotisation nécessite plusieurs rôles, **afin de** réduire le risque de fraude ou d'erreur.
- [ ] Déclaration par une personne, confirmation par une autre ; troisième contrôleur distinct si requis.
- [ ] Si contrôle non requis, la confirmation entraîne validation par le serveur dans la même transaction.
- [ ] Cotisation du trésorier confirmée par son suppléant ; impossibilité d’indépendance = blocage.
- [ ] Une notification ne compte pas comme une validation.

### 6.4 Anti-collusion — *P0*
**En tant que** membre, **je veux** être notifié de chaque validation, **afin de** détecter rapidement une anomalie.
- [ ] Indépendance non désactivable entre déclarant et confirmateur ; troisième acteur si règle requise.
- [ ] Chaque validation apparaît dans les notifications internes des membres autorisés, sans diffuser justificatifs ni commentaires privés.
- [ ] Les canaux externes respectent préférences et quotas ; la validation conserve sa valeur métier en cas d’échec d’envoi.

### 6.5 Contestation — *P0*
**En tant que** membre, **je veux** pouvoir contester une cotisation dans une fenêtre définie, **afin de** corriger une erreur sans bloquer tout le groupe.
- [ ] Fenêtre ordinaire proposée de 7 jours après notification ; signalement tardif de fraude ou erreur grave toujours possible.
- [ ] Avant validation : bloquer la validation ; après validation : bloquer clôture et opérations dépendantes du montant contesté.
- [ ] Motif obligatoire, pièces non obligatoires et désactivées au pilote ; impact présenté aux membres.

### 6.6 Correction — *P0*
**En tant que** système, **je veux** interdire toute suppression de cotisation, **afin de** préserver l'intégrité de l'historique.
- [ ] Aucun UPDATE/DELETE métier silencieux d’une opération validée.
- [ ] Contre-écriture totale de l’original puis nouvelle déclaration correcte si nécessaire.
- [ ] Original compensé au plus une fois ; original, correction et validations liés dans l’export.
- [ ] Droits des données traités séparément selon la politique de conservation et non par falsification financière.

### 6.7 Défaut / retard — *P1*
**En tant que** groupe, **je veux** appliquer un statut de défaut et une pénalité selon les règles versionnées, **afin de** traiter les retards équitablement.
- [ ] Retard calculé automatiquement ; statut personnel de défaut décidé et motivé par le groupe.
- [ ] Pénalité seulement si activée et versionnée ; plafond et grâce appliqués.
- [ ] Aucun retard interprété comme une dette nouvelle par un modèle IA.

### 6.8 Rappels — *P1*
**En tant que** membre, **je veux** recevoir des rappels automatiques avant échéance, **afin de** ne pas oublier de cotiser.
- [ ] Rappel envoyé automatiquement selon un délai configurable avant chaque échéance
- [ ] Canal WhatsApp/push en opt-in explicite
- [ ] Aucun rappel envoyé si l'utilisateur a désactivé ce type de notification (voir 1.6, 11.5)

### 6.9 Brouillon — *P0*
**En tant que** membre, **je veux** sauvegarder un brouillon de déclaration, **afin d'**éviter une double soumission accidentelle.
- [ ] Sauvegarde de brouillon explicite (action distincte de la soumission finale)
- [ ] Boutons de navigation non liés à la soumission ne déclenchent jamais l'envoi (corrige le constat de l'audit UX)
- [ ] Brouillon récupérable après fermeture de l'app

### 6.10 Décaissement — *P0*
**En tant que** trésorier, **je veux** déclarer le décaissement au bénéficiaire, **afin de** documenter la sortie de fonds sans transfert réel via KÓMBE.
- [ ] Déclaration externe avec bénéficiaire, montant net, frais du groupe et date alléguée.
- [ ] Confirmation du bénéficiaire et contrôle distinct si prévu ; aucun transfert exécuté par KÓMBE.
- [ ] Frais individuels hors pot séparés pour éviter double déduction.
- [ ] Rapprochement par tour ; contestation bloque clôture sans réécrire un versement déjà externe.

## EPIC 7 — Gouvernance : propositions, votes, décisions

### 7.1 Proposition — *P0*
**En tant que** membre autorisé, **je veux** créer une proposition liée à un objet précis, **afin de** faire évoluer une règle ou une décision du groupe.
- [ ] Proposition rattachée à un objet (règle, rôle, échéance...) et à un motif
- [ ] Seuls les membres autorisés selon la matrice (4.5) peuvent proposer
- [ ] Proposition visible par tous les membres dès sa création

### 7.2 Vote — *P0*
**En tant que** membre, **je veux** voter oui/non/abstention sur une proposition, **afin de** participer à la décision collective.
- [ ] Trois options de vote : oui / non / abstention
- [ ] Votants identifiés (pas de vote anonyme) et horodatés
- [ ] Impossible de voter deux fois sur la même proposition

### 7.3 Quorum — *P0*
**En tant que** système, **je veux** calculer automatiquement le quorum, **afin de** garantir que chaque décision respecte les règles versionnées.
- [ ] Quorum calculé sur électorat figé à l’ouverture et règles versionnées.
- [ ] Arrivée ou départ ne change pas le dénominateur ; changement nécessaire = annulation tracée et nouvelle proposition.
- [ ] Abstentions, égalité, absence de suffrages et conflits d’intérêts testés.

### 7.4 Décision — *P0*
**En tant que** membre, **je veux** que chaque décision soit tracée avec sa date d'entrée en vigueur, **afin d'**avoir une trace vérifiable.
- [ ] Conserver auteur, votes, électorat, règle de calcul, résultat et date d’effet.
- [ ] Modification essentielle au prochain cycle ; administrative au prochain tour si autorisée ; jamais rétroactive.
- [ ] Approbation collective distincte des acceptations individuelles nécessaires.

### 7.5 Historique des décisions — *P0*
**En tant que** membre, **je veux** consulter l'historique complet des décisions, **afin de** comprendre l'évolution du groupe.
- [ ] Liste chronologique de toutes les décisions consultable par tout membre
- [ ] Filtrage par type de décision (règle, rôle, exclusion...)
- [ ] Détail de chaque décision accessible en un clic (votes, résultat, date d'effet)

---

## EPIC 8 — Litiges (Dispute Engine)

### 8.1 Ouverture de litige — *P0*
**En tant que** membre, **je veux** ouvrir un litige lié à un objet précis, **afin de** signaler un désaccord documenté.
- [ ] Objet du même groupe et accessible au demandeur ; motif et correction demandée.
- [ ] Pièces désactivées au pilote, puis optionnelles et minimisées si autorisées.
- [ ] Statut commun visible ; faits sensibles réservés aux parties et responsables autorisés.

### 8.2 Circuit de résolution — *P0*
**En tant que** groupe, **je veux** un circuit de résolution avec délais et escalade, **afin d'**éviter qu'un litige reste bloqué indéfiniment.
- [ ] Personnes non impliquées dans l’opération désignées pour la résolution.
- [ ] Échéance et escalade définies ; une hiérarchie de rôle ne remplace pas l’indépendance.
- [ ] Si tous sont impliqués, maintenir le blocage ciblé et suivre la procédure externe acceptée.

### 8.3 Résolution — *P0*
**En tant que** responsable désigné, **je veux** documenter la résolution d'un litige, **afin de** clore le dossier de façon vérifiable.
- [ ] Décision avec motif et actions ; clôturer le ticket seul ne change aucun montant.
- [ ] Correction uniquement par le circuit de compensation.
- [ ] Conservation selon politique des données ; existence et issue communes, détails sensibles restreints.

### 8.4 Statistiques litiges — *P1*
**En tant qu'**équipe pilote, **je veux** suivre le taux et le délai de résolution des litiges, **afin de** mesurer la santé du produit.
- [ ] Taux : déclarations contestées au moins une fois / déclarations soumises de la cohorte.
- [ ] Médiane de résolution visée sous 48 heures calendaires ; publier aussi p90 et dossiers encore ouverts.
- [ ] Taux cible inférieur à 2 %, à interpréter avec les entretiens sur la possibilité de contester.

### 8.5 Support externe — *P0*
**En tant que** membre, **je veux** un canal de support avec ticket numéroté, **afin d'**obtenir de l'aide sans que le support tranche mes litiges internes.
- [ ] Canal, horaires réels, numéro de ticket et responsable publiés avant G0.
- [ ] Support rétablit l’accès et explique les traces ; ne décide ni versement ni gagnant.
- [ ] S1, S2, S3 et escalade définis ; aucune promesse 24/7 sans capacité.

## EPIC 9 — Traçabilité (Trust Ledger)

### 9.1 Journal d'événements — *P0*
**En tant que** système, **je veux** enregistrer tout événement important en mode append-only, **afin de** garantir une trace protégée contre les modifications silencieuses.
- [ ] Événements métier avec acteur interne, rôle, type, version, corrélation et date serveur.
- [ ] Aucune modification silencieuse par les chemins applicatifs ; opérations d’administration exceptionnelles tracées.
- [ ] Les vues communes ne contiennent pas les données privées des litiges ; conservation des identités selon politique.

### 9.2 Chaîne d'intégrité — *P1*
**En tant qu'**auditeur, **je veux** que les événements soient chaînés par empreinte, **afin de** détecter toute altération rétroactive.
- [ ] Empreintes chaînées par groupe avec sérialisation déterministe et numéro de séquence.
- [ ] Points de contrôle séparés et contrôles d’accès ; ne pas prétendre qu’un hash empêche un administrateur de recalculer une chaîne.
- [ ] Rupture détectée = alerte et enquête ; outil de vérification avec jeux de référence.

### 9.3 Timeline — *P0*
**En tant que** membre non technique, **je veux** une vue chronologique lisible, **afin de** comprendre l'historique sans expertise technique.
- [ ] Timeline présentée en langage clair (pas de jargon technique brut)
- [ ] Filtrage par type d'événement (cotisation, décision, litige...)
- [ ] Chaque entrée renvoie vers le détail complet de l'événement

### 9.4 Journal métier et journal technique — *P0*
**En tant qu’**équipe sécurité, **je veux** séparer les traces métier et techniques, **afin de** limiter les accès et détecter les modifications abusives.
- [ ] Stockage et accès logiquement séparés, politiques de conservation adaptées à chaque finalité.
- [ ] Aucun chemin applicatif ne modifie silencieusement les événements validés ; privilèges techniques limités et surveillés.
- [ ] Un administrateur privilégié peut présenter un risque résiduel ; contrôles indépendants, points de contrôle externes et sauvegardes permettent une détection.

### 9.5 Totaux calculés — *P0*
**En tant que** système, **je veux** que tout total affiché soit calculé depuis les événements, **afin d'**éliminer tout champ agrégé falsifiable.
- [ ] Totaux reconstruisibles depuis les événements validés et compensations.
- [ ] Projections et vues matérialisées permises si non éditables directement et réconciliées.
- [ ] Une projection reconstruite égale les totaux de référence ; un écart déclenche une alerte.

### 9.6 Journal d’administration — *P0*
**En tant qu'**équipe sécurité, **je veux** que tout accès support soit just-in-time et à double approbation, **afin de** limiter les abus d'accès administrateur.
- [ ] Accès support temporaire, expirant automatiquement
- [ ] Double approbation requise avant tout accès administrateur à des données sensibles
- [ ] Chaque accès administrateur journalisé avec motif

### 9.7 Audit log sécurité — *P0*
**En tant qu'**équipe sécurité, **je veux** des alertes automatiques sur les événements sensibles, **afin de** détecter rapidement une activité anormale.
- [ ] Alerte sur création massive de comptes/groupes
- [ ] Alerte sur échecs OTP répétés
- [ ] Alerte sur tout changement de rôle (lien avec 4.9)

---

## EPIC 10 — Preuves & Exports (Proof Engine)

### 10.1 Relevé PDF/CSV — *P0*
**En tant que** membre, **je veux** exporter un relevé complet, **afin de** disposer d'une preuve hors de l'application.
- [ ] PDF imprimable de base et CSV avec groupe, période, règles, séquence de coupure, événements, corrections et écarts.
- [ ] Accès filtré selon droits actuels et historiques ; quotas proportionnés sans supprimer le droit d’accès.
- [ ] Texte CSV neutralisé contre les formules ; aucune donnée privée dans un export commun.

### 10.2 Empreinte du fichier — *P0*
**En tant qu'**utilisateur, **je veux** que chaque export porte une empreinte (hash), **afin de** pouvoir vérifier son intégrité ultérieurement.
- [ ] Empreinte calculée après finalisation des octets, enregistrée dans un manifeste séparé et un événement.
- [ ] Ne pas modifier le fichier après calcul ; vérification indépendante possible.
- [ ] Ne pas assimiler hash, authenticité d’un paiement et signature juridique.

### 10.3 Langage prudent — *P0*
**En tant qu'**équipe conformité, **je veux** que la communication autour des exports reste prudente, **afin de** ne jamais promettre une valeur juridique automatique.
- [ ] Terminologie imposée : "historique vérifiable", jamais "preuve légale" ou équivalent
- [ ] Aucun écran ne promet de valeur juridique automatique au document exporté
- [ ] Mention systématique rappelant la nature du document à l'export

### 10.4 Export imprimable — *P0*
**En tant que** membre habitué au cahier papier, **je veux** un format d'export imprimable, **afin de** garder une trace physique familière.
- [ ] L’export de base est lisible et imprimable dès le pilote.
- [ ] La mise en page d’un export opérationnel pourra être A4 ; ce dossier documentaire reste au format Word standard.
- [ ] Fonction avancée de personnalisation imprimée éventuelle en P2.

### 10.5 Export final et signature conditionnelle — *P1*
**En tant que** fondateur, **je veux** un export final vérifiable à la clôture, **afin de** disposer d'une version finale de référence.
- [ ] À clôture, générer un export final versionné et son manifeste.
- [ ] Signature uniquement si algorithme, clé, signataire, gestion des clés et vérificateur sont effectivement disponibles.
- [ ] Autrement nommer le résultat export avec empreinte ; accès limité aux participants autorisés.

### 10.6 API partenaire (V2) — *P2*
**En tant qu'**EMF ou banque partenaire, **je veux** un accès lecture après validation du cœur produit, **afin d'**intégrer les données de KÓMBE dans mes propres processus.
- [ ] Accès partenaire soumis à dossier contractuel, finalités, droits individuels et revue de sécurité dédiée.
- [ ] Consentement collectif ne vaut pas automatiquement autorisation de communiquer chaque donnée personnelle.
- [ ] Lecture seule, périmètre minimal, journalisation et révocation ; report hors V1.

## EPIC 11 — Notifications

### 11.1 File d'attente — *P0*
**En tant que** système, **je veux** envoyer les notifications de façon asynchrone, **afin de** ne jamais bloquer une action utilisateur critique (ex. validation).
- [ ] Notifications envoyées via une queue asynchrone avec retries
- [ ] Journal de livraison consultable (succès/échec par notification)
- [ ] Aucun envoi synchrone bloquant une transition d'état métier

### 11.2 WhatsApp — *P1*
**En tant que** membre, **je veux** recevoir mes rappels et demandes de validation par WhatsApp, **afin de** rester informé sur mon canal principal.
- [ ] Au pilote : partage manuel d’un lien sans dépendre d’une intégration WhatsApp.
- [ ] Automatisation après contrôle fournisseur, consentement, modèles, coûts et quotas.
- [ ] Alertes de sécurité gratuites dans l’application ; aucun engagement de canal externe illimité.

### 11.3 SMS (option payante) — *P2*
**En tant que** membre sans WhatsApp, **je veux** recevoir mes notifications par SMS, **afin de** ne pas être exclu selon mon équipement.
- [ ] Envoi SMS disponible en option payante avec opt-in explicite
- [ ] Quotas définis pour éviter les coûts incontrôlés
- [ ] Fallback SMS proposé si WhatsApp indisponible sur l'appareil du membre

### 11.4 Push/in-app — *P0*
**En tant que** membre, **je veux** recevoir toutes les notifications sensibles en push/in-app, **afin de** ne pas dépendre d'un canal externe payant pour l'essentiel.
- [ ] Notifications internes persistantes et synchronisées à la reconnexion.
- [ ] Push disponible selon client et fournisseur ; écran verrouillé sans montants ou détails sensibles.
- [ ] Un échec externe ne bloque ni la transaction métier ni l’accès à la notification interne.

### 11.5 Préférences — *P1*
**En tant que** membre, **je veux** paramétrer mes notifications par type d'événement, **afin d'**éviter la surcharge informationnelle.
- [ ] Préférences par événement et canal ; appliquer dès la prochaine tâche.
- [ ] Les informations de sécurité restent consultables en interne ; préférences externes respectées.
- [ ] Consentement marketing distinct des messages nécessaires au service.

## EPIC 12 — Expérience & Accessibilité

### 12.1 Parcours guidé — *P0*
**En tant que** nouvel utilisateur, **je veux** un parcours en 4 étapes, **afin de** créer mon groupe sans me perdre.
- [ ] Étapes : modèle → Njangi → caisse → récapitulatif
- [ ] Possibilité de revenir en arrière sans perdre les données déjà saisies
- [ ] Récapitulatif final avant validation définitive

### 12.2 Mode faible connectivité — *P1*
**En tant qu'**utilisateur en zone rurale, **je veux** une expérience offline-first, **afin d'**utiliser l'app malgré une connexion instable.
- [ ] Cache de lecture autorisé avec date de synchronisation ; brouillons distincts des commandes acceptées.
- [ ] Validation, vote, rôle et règles exigent le serveur ; resoumission contrôlée des déclarations.
- [ ] Révocation contrôlée à la reconnexion ; durée de cache limitée et mode appareil partagé.
- [ ] Choix PWA ou Flutter confirmé après revue du dépôt, pas une obligation de réécriture.

### 12.3 Skeleton screens — *P2*
**En tant qu'**utilisateur, **je veux** des écrans de chargement progressifs, **afin de** ne pas percevoir l'app comme lente.
- [ ] Skeleton screens remplacent le splash/loading générique
- [ ] Mesure LCP/INP suivie en continu
- [ ] Cache PWA maîtrisé pour limiter les rechargements inutiles

### 12.4 Accessibilité — *P1*
**En tant qu'**utilisateur en situation de handicap, **je veux** une app conforme WCAG AA, **afin de** pouvoir l'utiliser pleinement.
- [ ] Contrastes, navigation au clavier pour le web, taille de texte, libellés et erreurs testés.
- [ ] Objectif WCAG AA vérifié avec version et périmètre documentés ; aucune certification implicite.
- [ ] Les blocages empêchant une action centrale restent P0.

### 12.5 Performance — *P1*
**En tant qu'**utilisateur mobile, **je veux** une app rapide même sur réseau faible, **afin de** ne pas abandonner en cours d'usage.
- [ ] Cible p95 serveur sous 700 ms sur routes et charge spécifiées ; réseau de bout en bout mesuré séparément.
- [ ] Tester les téléphones réels du pilote et un réseau dégradé.
- [ ] Mesurer poids transféré, reprises, erreurs et latence ; ne pas annoncer résultat avant benchmark.

### 12.6 Bilingue FR/EN — *P1*
**En tant qu'**utilisateur, **je veux** une app entièrement bilingue, **afin de** l'utiliser dans ma langue de préférence.
- [ ] Tous les écrans et notifications disponibles en FR et EN
- [ ] Vocabulaire local intégré dans les deux langues (lien avec 3.8)
- [ ] Bascule de langue accessible à tout moment depuis le profil

---

## EPIC 13 — Juridique, Confiance & Conformité (transverse)

### 13.1 Pages légales — *P0*
**En tant qu'**utilisateur, **je veux** accéder aux pages légales complètes, **afin de** connaître mes droits et recours.
- [ ] CGU, confidentialité, cookies, contact et procédure de plainte publiés (aucune mention "bientôt")
- [ ] Pages accessibles depuis le footer et l'inscription
- [ ] Version et date de dernière mise à jour affichées sur chaque page légale

### 13.2 Communication prudente — *P0*
**En tant qu'**équipe conformité, **je veux** bannir certains termes de toute l'interface, **afin de** ne jamais laisser croire à une garantie des fonds.
- [ ] Positionnement : registre partagé, paiements hors application, aucune garantie du pot.
- [ ] Compte utilisateur autorisé ; compte de paiement ou dépôt KÓMBE exclu du pilote.
- [ ] Revue de compréhension auprès des membres ; pas de promesse de preuve juridique automatique.

### 13.3 Protection des données — *P0*
**En tant qu'**équipe conformité, **je veux** appliquer la loi 2024/017, **afin de** protéger les données personnelles des membres.
- [ ] Registre des traitements avec finalités, bases à confirmer, accès, fournisseurs, pays, durées et contact.
- [ ] Pas de CNI, relevé bancaire, capture de paiement ni données médicales au pilote.
- [ ] Procédure de droits et purge incluant index, caches, fichiers et sauvegardes selon cycle de vie.
- [ ] Identités séparées du journal ; pas de conservation nominative indéfinie.
- [ ] Revue de la loi 2024/017 et du montage réel par conseil local avant publication ; contrats fournisseurs à obtenir.

### 13.4 Consentement recherche — *P0*
**En tant que** participant au pilote, **je veux** un protocole de consentement clair, **afin de** comprendre ma participation à la recherche.
- [ ] Consentement explicite recueilli avant toute observation liée au pilote
- [ ] Compensation limitée au temps de recherche, jamais aux cotisations elles-mêmes
- [ ] Droit de retrait du pilote sans perte d'accès aux données personnelles

### 13.5 Consentement scoring (V2) — *V2*
**En tant qu'**utilisateur, **je veux** un consentement séparé et explicite pour tout usage de scoring, **afin de** ne pas être profilé sans le savoir.
- [ ] Finalité "scoring" strictement séparée de la finalité "usage du registre"
- [ ] Consentement explicite et révocable, distinct du consentement général
- [ ] Fonctionnalité bloquée tant que le cadre réglementaire (loi 2024/017, profilage) n'est pas validé

---

## EPIC 14 — Sécurité & Administration (transverse, non visible)

### 14.1 Autorisation objet — *P0*
**En tant qu'**équipe sécurité, **je veux** un contrôle d'accès objet côté serveur, **afin d'**empêcher un membre A de lire ou modifier le groupe B (IDOR).
- [ ] RBAC + règles objet appliquées côté serveur pour toute lecture et mutation
- [ ] Row-Level Security PostgreSQL activée en défense additionnelle
- [ ] Tests IDOR systématiques avant chaque mise en production

### 14.2 Tests multi-tenant — *P0*
**En tant qu'**équipe QA, **je veux** tester systématiquement l'isolation entre groupes, **afin de** garantir 0 accès intergroupe.
- [ ] Test manuel multi-rôles/multi-groupes exécuté avant chaque release
- [ ] Scénarios couvrant tous les rôles (4.4) contre tous les objets d'un autre groupe
- [ ] Résultat des tests documenté et archivé

### 14.3 Secrets & config — *P0*
**En tant qu'**équipe technique, **je veux** qu'aucun secret ne soit exposé côté client, **afin de** réduire la surface d'attaque.
- [ ] Aucun secret (clé API, token) présent dans le code client
- [ ] Rotation périodique des secrets
- [ ] Environnements (dev/staging/prod) strictement séparés

### 14.4 Cookies/sessions — *P0*
**En tant qu'**équipe sécurité, **je veux** des cookies et sessions durcis, **afin de** limiter les attaques CSRF et session hijacking.
- [ ] Cookies Secure, HttpOnly, SameSite
- [ ] Protection CSRF active si authentification par cookie
- [ ] CSP stricte et HSTS activés

### 14.5 Chiffrement — *P0*
**En tant qu'**équipe sécurité, **je veux** chiffrer données et fichiers, **afin de** protéger la confidentialité même en cas de fuite.
- [ ] Données et sauvegardes chiffrées au repos
- [ ] Fichiers stockés en objet privé (pas d'URL publique permanente)
- [ ] URLs de fichiers courtes et expirantes, avec scan du type/taille à l'upload

### 14.6 Sauvegarde/reprise — *P0*
**En tant qu'**équipe technique, **je veux** une sauvegarde et restauration testées, **afin de** garantir la continuité en cas d'incident.
- [ ] RPO ≤ 24 h
- [ ] RTO ≤ 8 h
- [ ] Exercice de restauration réellement exécuté et documenté (pas seulement planifié)

### 14.7 Redaction logs — *P0*
**En tant qu'**équipe sécurité, **je veux** qu'aucune donnée sensible n'apparaisse en clair dans les logs, **afin de** limiter l'impact d'une fuite de logs.
- [ ] Aucun numéro de téléphone en clair dans les logs applicatifs
- [ ] Aucune référence de paiement en clair dans les logs
- [ ] Revue périodique des logs pour détecter toute fuite résiduelle

### 14.8 CI/CD sécurité — *P0*
**En tant qu'**équipe technique, **je veux** des contrôles de sécurité automatisés sur chaque PR, **afin de** détecter les vulnérabilités avant production.
- [ ] SAST exécuté sur chaque pull request
- [ ] SCA (analyse des dépendances) exécuté sur chaque pull request
- [ ] Secret scanning exécuté sur chaque pull request
- [ ] DAST exécuté sur l'environnement de staging

### 14.9 Plan d'incident — *P0*
**En tant qu'**équipe technique, **je veux** un plan d'incident documenté et testé, **afin de** réagir efficacement en cas de problème.
- [ ] Propriétaire d'incident désigné nommément
- [ ] Canal de communication utilisateur défini pour les incidents
- [ ] Exercice (drill) d'incident réalisé au moins une fois avant le pilote

### 14.10 Pentest — *P0*
**En tant qu'**équipe sécurité, **je veux** un test d'intrusion externe avant G1, **afin de** valider le niveau de sécurité réel.
- [ ] Cible ASVS 5.0.0 niveau 2 avec périmètre et exigences applicables identifiés.
- [ ] Revue externe et test d’intrusion adaptés avant données réelles pour les chemins critiques ; extension de la couverture avant G1.
- [ ] Failles critiques et élevées liées aux données ou à l’intégrité corrigées et retestées ; un scanner seul ne certifie pas la sécurité.

## EPIC 15 — Monétisation

### 15.1 Découverte — *P1*
**En tant qu'**utilisateur, **je veux** un plan gratuit pour tester KÓMBE, **afin d'**évaluer le produit sans engagement.
- [ ] Hypothèse gratuite : un groupe et douze membres ; prix et quotas à valider.
- [ ] Ne pas supprimer l’historique d’un cycle en cours au bout de 90 jours ; politique de données distincte de l’offre.
- [ ] Maintenir règles, contestation et export de base ; évolution payante sans perte d’historique.

### 15.2 Groupe — *P1*
**En tant que** groupe actif, **je veux** un plan payant adapté, **afin d'**accéder aux fonctionnalités avancées.
- [ ] Tarif expérimental : 1 500 XAF/mois ou 15 000/an par groupe, jusqu’à 30 membres après extension.
- [ ] Rappels externes sous quota, exports avancés et support aux horaires publiés.
- [ ] Paiement d’abonnement distinct des cotisations ; annulation, expiration et remboursement du service documentés.

### 15.3 Association — *P2*
**En tant qu'**association gérant plusieurs tontines, **je veux** un plan dédié, **afin de** superviser plusieurs groupes efficacement.
- [ ] Hypothèse de 5 000 XAF/mois pour cinq groupes ; ne pas promettre cinquante groupes au même prix.
- [ ] Rôles de supervision explicitement autorisés, pas de lecture automatique par le payeur.
- [ ] Mesurer marge réelle incluant assistance et messages avant généralisation.

### 15.4 Options payantes — *P2*
**En tant qu'**utilisateur, **je veux** activer des options à la carte, **afin de** payer uniquement ce dont j'ai besoin.
- [ ] Options SMS, accompagnement et stockage minimisé si admissible ; pas de vente de données individuelles.
- [ ] Prix, quota, taxes applicables et arrêt des options explicites.
- [ ] Aucune pièce sensible activée pour vendre une option non nécessaire.

### 15.5 Test de prix réel — *P1*
**En tant qu'**équipe produit, **je veux** tester trois niveaux de prix réels après un cycle réussi, **afin de** mesurer la volonté de payer effective (pas déclarative).
- [ ] Offres testées 1 000, 1 500 et 2 500 XAF après cycle utile, protocole annoncé et contenu comparable.
- [ ] Mesurer groupes exposés, paiements obtenus, annulations, support et renouvellements.
- [ ] Sur petit échantillon, publier nombres bruts sans prétendre déterminer un prix optimal statistique.

### 15.6 Frais Mobile Money — *P1*
**En tant qu'**utilisateur, **je veux** voir les frais Mobile Money affichés séparément, **afin de** comprendre le coût réel de chaque transaction.
- [ ] Frais externes documentés séparément : contribution, frais personnels hors pot, frais du groupe.
- [ ] Ne pas appliquer universellement 0,2 % + 4 XAF ; consulter le CGI et le prestataire selon canal.
- [ ] En V1, ne pas prélever un tarif de paiement KÓMBE ; abonnement traité séparément.

## EPIC 16 — Pilote & Mesure

### 16.1 Funnel instrumenté — *P0*
**En tant qu'**équipe produit, **je veux** un funnel d'analytics complet, **afin de** mesurer l'activation sans exposer de contenu financier.
- [ ] Étapes suivies : visite → démarrage → règles créées → invitations → membres acceptés → 1ʳᵉ contribution → 1ʳᵉ validation → cycle terminé → paiement abonnement
- [ ] Aucun montant ni donnée financière individuelle présent dans l'outil d'analytics
- [ ] Funnel exportable pour analyse par cohorte de pilote

### 16.2 Tableau de bord pilote — *P0*
**En tant qu'**équipe produit, **je veux** un tableau de bord des indicateurs clés, **afin de** suivre la santé du pilote en continu.
- [ ] Utiliser les dénominateurs du chapitre 19 et afficher les nombres bruts.
- [ ] Distinguer trois tours, un cycle et trois cycles ; aucune rétention à trois cycles annoncée précocement.
- [ ] Tableau de suivi pilote manuel acceptable au démarrage si calculs reproductibles ; automatisation selon besoin.
- [ ] Seuils exploratoires : activation 70 %, complétude 90 %, médiane validation sous 24 h, litiges sous 2 %, rétention trois cycles 60 %, paiement réel 25 %.

### 16.3 Registre des risques — *P0*
**En tant qu'**équipe produit, **je veux** un registre des risques revu mensuellement, **afin de** piloter activement les risques critiques du pilote.
- [ ] Chaque risque documenté avec : probabilité, impact, contrôle, preuve, risque résiduel
- [ ] Revue mensuelle formalisée avec propriétaire désigné par risque
- [ ] Risque "critique" sans contrôle effectif bloque explicitement l'extension du pilote

---

## EPIC 17 — Futur (hors V1, post portes de contrôle)

*Ces items ne sont pas des user stories actionnables en V1 — ils sont listés pour mémoire avec leurs conditions de déblocage, à reformuler en epics complets lorsque la porte correspondante est atteinte.*

| # | Fonctionnalité | Condition de déblocage | Porte |
|---|---|---|---|
| 17.1 | Connecteur Mobile Money | ≥30 groupes actifs, 3 cycles, rétention ≥60 %, partenaire agréé signé, avis légal, ASVS L2, rapprochement idempotent (webhooks signés, pas de solde KÓMBE) | G3 |
| 17.2 | Scoring / Financial Passport | Données de comportement fiables + consentement explicite (loi 2024/017) + finalité encadrée | V2 |
| 17.3 | API partenaires (EMF/banques) | Cœur validé, contrats, sandbox plafonné | G3 |
| 17.4 | Assurance/réassurance caisses de secours | Partenariat type Social Broker | V2 |
| 17.5 | Jamais sans analyse formelle | Wallet propriétaire, conservation de fonds, crédit, marketplace de prêts, crypto, investissement du pot — **interdits sans avis juridique formel** | — |

---


## EPIC 18 — Documentation et exigences complémentaires proposées

### 18.1 Idempotence des commandes — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** éviter qu’une reprise réseau crée une deuxième opération, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Même clé et même corps = même résultat sans deuxième événement métier.
- [ ] Même clé et corps différent = conflit 409.
- [ ] Deux demandes simultanées sur la même clé sont sérialisées.

### 18.2 Concurrence et version des objets — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** empêcher une validation sur des données dépassées, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Version attendue obligatoire sur commande mutante d’objet existant.
- [ ] Validation concurrente et dépassement du restant dû testés.
- [ ] Conflit explicite, sans écrasement silencieux.

### 18.3 Versements partiels — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** enregistrer des paiements fractionnés sans fausser une échéance, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Plusieurs déclarations couvrent une seule obligation.
- [ ] Restant dû calculé depuis écritures validées nettes et engagements en cours selon le contrat.
- [ ] Excédent bloqué ; aucune affectation automatique au tour suivant.

### 18.4 Frais et rapprochement — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** distinguer le pot des frais supportés personnellement, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Frais du groupe et frais individuels séparés.
- [ ] Contributions nettes = décaissements nets + frais groupe pour clôture normale.
- [ ] L’écart reste visible et bloque la clôture.

### 18.5 Électorat et conflits d’intérêts — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** rendre le résultat d’un vote reproductible, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Électorat figé et récusations appliquées à l’ouverture.
- [ ] Égalité, abstention, zéro suffrage, arrondi et hors délai testés.
- [ ] Changement d’électorat crée une nouvelle proposition après annulation motivée.

### 18.6 Outbox et notifications en échec — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** ne pas perdre une alerte après une transaction réussie, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Événement et tâche écrits dans la même transaction.
- [ ] Worker avec tentatives bornées, déduplication et file d’échec.
- [ ] Échec de message sans rollback de la validation.

### 18.7 Reprise hors connexion — *P1*
**En tant que** partie prenante de KÓMBE, **je veux** soumettre mes brouillons sans doublon ni droit périmé, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Dernière synchronisation visible et brouillon non assimilé à déclaration.
- [ ] Droits et règles recontrôlés au retour réseau.
- [ ] Cache limité et purge à déconnexion, cas appareil partagé testé.

### 18.8 Manifeste d’export — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** vérifier qu’un relevé n’a pas changé, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Hash final enregistré hors du fichier et dans le journal.
- [ ] Séquence de coupure et version du générateur indiquées.
- [ ] Modification d’octet détectée ; pas de promesse de signature.

### 18.9 Clôture et arrêt exceptionnel — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** terminer un groupe sans masquer un impayé, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Clôture normale refuse tout écart ou litige bloquant.
- [ ] Arrêt exceptionnel produit un bilan avec obligations restantes.
- [ ] Accès historique filtré après la fin des adhésions.

### 18.10 Purge et restauration des droits — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** éviter de réintroduire des données effacées, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Durées et gels documentés par catégorie.
- [ ] Effacement propagé aux index, caches et fichiers.
- [ ] Restauration isolée réapplique suppressions et révocations avant réouverture.

### 18.11 Abonnement et réversibilité — *P1*
**En tant que** partie prenante de KÓMBE, **je veux** conserver mon historique si je cesse de payer, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Abonnement indépendant du registre des cotisations.
- [ ] Quotas, expiration, remboursement du service et export expliqués.
- [ ] Aucune suppression du registre actif pour motif de forfait.

### 18.12 Import d’un historique papier — *P2*
**En tant que** partie prenante de KÓMBE, **je veux** reprendre un ancien cahier sans inventer des confirmations, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Import étiqueté historique rapporté, avec auteur et date de reprise.
- [ ] Aucune validation antidatée automatique.
- [ ] Aperçu, détection de doublons et approbation du groupe avant activation.

### 18.13 Mesure du pilote — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** prendre une décision fondée sur des cohortes comparables, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Tours et cycles distincts avec dates d’éligibilité.
- [ ] Dénominateurs, nombres bruts et minutes de support conservés.
- [ ] Analytics sans contenu financier individuel.

### 18.14 Mode réunion — *P2*
**En tant que** partie prenante de KÓMBE, **je veux** réduire le temps de rapprochement pendant la réunion, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Affiche validations, écarts, litiges et prochain bénéficiaire.
- [ ] N’expose aucun commentaire privé aux participants non autorisés.
- [ ] Temps de réunion comparé à une mesure initiale sur trois séances.

### 18.15 Aide déterministe — *P2*
**En tant que** partie prenante de KÓMBE, **je veux** retrouver une règle sans risquer un chiffre inventé, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Réponses issues de requêtes autorisées et modèles FR/EN.
- [ ] Source et date de synchronisation visibles.
- [ ] Ambiguïté déclenche clarification, pas une invention.

### 18.16 Benchmark IA locale — *P2*
**En tant que** partie prenante de KÓMBE, **je veux** vérifier la faisabilité avant tout téléchargement imposé, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Mesure stockage, RAM, batterie et latence sur appareils cibles.
- [ ] Tests séparés d’entraînement ; attaques et fuites incluses.
- [ ] Bascule vers aide déterministe si critères non atteints ; aucun droit d’écriture.

### 18.17 Accès temporaire du support — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** limiter l’exposition des données pendant une assistance, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Accès minimal, justifié, approuvé par une personne distincte et expirant.
- [ ] Actions journalisées sans contenu sensible superflu.
- [ ] Aucun accès support permettant de valider une cotisation.

### 18.18 Runbook et couverture réelle — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** savoir qui agit pendant un incident, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Responsable et suppléant nommés, horaires publiés.
- [ ] Exercice de containment et restauration avant G0.
- [ ] Retour d’expérience avec dates de correction.

### 18.19 Traitement des demandes personnelles — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** exercer mes droits sans divulguer un autre membre, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Vérification proportionnée de la demande et ticket de suivi.
- [ ] Export personnel filtré et réponse selon délai légal confirmé.
- [ ] Motif de restriction ou gel documenté, pas de refus automatique.

### 18.20 Registre de décision et de versions — *P0*
**En tant que** partie prenante de KÓMBE, **je veux** garder les documents et le produit cohérents, **afin de** disposer d’un service vérifiable et exploitable.
- [ ] Chaque arbitrage a auteur, date, alternatives et conséquences.
- [ ] Chaque release relie version de schéma, backlog et recette.
- [ ] Les propositions non adoptées restent explicitement marquées.

## Traçabilité et emploi du backlog

110 entrées historiques conservées : 105 fiches détaillées et 5 perspectives. Ajout de 20 fiches, soit 130 entrées au total. Les cases restent non cochées : aucune réalisation n’a été auditée dans le code.

Les priorités v2 sont des propositions. Promotions P0 : statut/clôture du groupe, support minimal, journal d’administration et export imprimable ; report de l’automatisation WhatsApp en P1. Les critères réécrits prévalent sur les formulations correspondantes des originaux.

Dépendances critiques : 3.1 et 4.5 avant 6.1 ; 9.1, 18.1 et 18.2 avant 6.3 ; 6.3 avant 6.6 ; 7.3 et 18.5 avant 3.7 ; 18.4 et 8.3 avant 2.8 ; 13.3 et 18.10 avant données réelles ; 14.6 et 18.18 avant G0. Ajouter responsable, estimation, preuve de recette et version livrée pendant le sprint planning.
