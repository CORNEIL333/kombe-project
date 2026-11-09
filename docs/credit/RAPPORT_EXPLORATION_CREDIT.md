# Crédit et BNPL dans KÓMBE : rapport d'exploration

Rapport du 6 novembre 2026. Exploration seulement : rien n'est implémenté, aucun code n'a été modifié. Ce document n'est pas un avis juridique.

## 1. Conclusion

**Oui, du crédit est possible dans KÓMBE, mais pas sous la forme décrite par le cahier des charges.** Tout dépend de qui prête et de qui touche l'argent.

| Question | Réponse courte |
|---|---|
| Peut-on techniquement ajouter du crédit ? | Oui. Le socle est solide, et un registre de prêts existe déjà, fermé |
| Peut-on construire la plateforme BNPL complète ? | Pas raisonnablement aujourd'hui. Sur 19 modules, 5 sont absents, et les plus lourds ne servent pas une tontine |
| Le plus gros obstacle est-il technique ? | Non. C'est le droit, puis le risque financier, puis la fiabilité des données |
| Que faire en premier ? | Les prêts internes au groupe et l'attestation de régularité, après avis juridique |
| Que ne pas faire ? | Faire de KÓMBE un prêteur. Il faudrait au moins 150 à 300 millions de FCFA de capital, un agrément, et renoncer à la promesse actuelle |

**Trois constats à retenir :**

1. **Les données de KÓMBE ne sont pas encore « bancables ».** Le registre est déclaratif : un paiement est déclaré et confirmé par des membres, pas observé sur un compte. Un prêteur ne peut pas s'y fier seul, et des complices pourraient fabriquer un faux historique (section 6).
2. **Le produit le plus naturel n'est pas le BNPL marchand, mais l'avance sur le pot.** Il correspond à un vrai besoin de tontine, mais c'est aussi le scénario le plus délicat juridiquement (section 4).
3. **Un sujet urgent existe sans aucun crédit.** La loi camerounaise sur les données s'applique depuis le 23 juin 2026 et KÓMBE est hébergé à Francfort (section 7).

## 2. Ce que propose le cahier des charges

Le document décrit un « système d'exploitation d'entreprise » : CRM, back-office, moteur de crédit et de risque, paiements, comptabilité, conformité, recouvrement, marchands.

**Il vise une entreprise différente de KÓMBE :**

| | Cahier des charges | KÓMBE aujourd'hui |
|---|---|---|
| Client | Un consommateur qui achète chez un marchand | Un membre d'un groupe de confiance |
| Argent | Circule dans la plateforme | Ne passe jamais par KÓMBE |
| Risque de défaut | Porté par le prêteur | Porté par le groupe, géré par ses règles |
| Décision | Score et règles automatiques | Vote, bureau, statuts du groupe |
| Unité centrale | Le client | Le groupe |

**Réserves sur le document lui-même :**

- Il annonce 130 exigences, mais son tableau en contient **182** d'après ses identifiants (CUS-12, CRM-08, KYC-12 et ainsi de suite).
- Ses références sont des marqueurs sans lien, inutilisables. Les points qui comptent ont été recherchés à nouveau, et ses prix fournisseurs n'ont pas été vérifiés.
- Son budget (600 000 € à 1,5 M€ pour un premier produit, 2 à 6 M€ pour une plateforme mature) est sa propre estimation, hors capital prêté.
- Il oublie des textes essentiels : la loi camerounaise n° 2019/021 sur le crédit, et le règlement CEMAC sur les bureaux d'information sur le crédit.

## 3. Où en est KÓMBE, module par module

Examen du code de la version en production : 84 tables, environ 205 routes, 43 ADR, 4 consoles.

**Légende.** Solide : l'essentiel existe. Partiel : une base réutilisable existe. Absent : rien d'utilisable.

| Module du cahier des charges | État | Ce qui existe | Ce qui manque | Utile à |
|---|---|---|---|---|
| Client (Customer 360) | Partiel | `identity`, `identity_profile`, photo, `membership`, sessions, appareils de notification | Vue 360 unique, empreinte d'appareil, détection de doublons | Tous |
| CRM (prospects, ventes) | Absent | Rien | Tout | Aucun scénario proche |
| KYC / KYB | Absent | E-mail ou téléphone vérifié seulement | Pièces d'identité, selfie, sanctions | Crédit partenaire, porté par le partenaire |
| Configuration produit | Partiel | Règles et statuts versionnés, non rétroactifs, propres à chaque groupe | Catalogue de produits, pays, entités | Crédit partenaire |
| Crédit / BNPL | Partiel | Table `loan`, caisse de prêt, `loanSchedule`, état jusqu'au défaut | Routes, écrans, contrat, accord de l'avaliseur | Prêts internes |
| Risque et score | Absent | `scoring` interdit par ADR-0005. `pilot_risk` est un registre de projet, pas un moteur | Tout | KÓMBE prêteur |
| Fraude | Partiel | Limites de débit, `security_log` | Empreinte d'appareil, vélocité, détection de complicité | Crédit partenaire |
| Paiements | Absent | Canaux déclarés (espèces, Orange Money, MTN MoMo), aucun encaissement réel | Tout, volontairement | Scénarios qui touchent l'argent |
| Comptabilité (ledger) | Partiel | Journal immuable chaîné par hash, mouvements de caisse, contre-écritures, rapprochement de tour | Vraie partie double, plan de comptes | KÓMBE prêteur |
| Marchands | Absent | Rien | Tout | BNPL marchand |
| Recouvrement | Partiel | Dette suivie, abandon par la présidence, avaliseur, relances d'échéance | Promesses de paiement, plans de restructuration | Prêts internes |
| Litiges | Solide | Dossiers, affectation, recours, indépendance de la résolution | Rétrofacturations, sans objet | Tous |
| Support | Partiel | Accès support à durée limitée et double approbation | File de tickets (aucune table dédiée) | Tous |
| Communications | Solide | File d'envoi, livraison, préférences, heures de silence | Modèles versionnés à vérifier | Tous |
| Conformité | Partiel | Journal, consentements, registre des traitements, export, effacement | Conservation légale (legal hold), registre d'incidents, lutte anti-blanchiment | Tous |
| Administration | Solide | Rôles opérateurs, second facteur TOTP, accès temporaire, journal opérateurs, 55 activations RLS | SSO, droits plus fins (support, risque, conformité) | Tous |
| Intégrations | Partiel | API REST, OpenAPI, idempotence, onglet Intégration | OAuth partenaires, webhooks sortants, bac à sable | Crédit partenaire |
| Exploitation | Partiel | Santé, métriques, runbooks, alertes de console, charge mesurée | Traces distribuées, alertes SLO | Tous |
| Données | Partiel | `analytics_event`, économie unitaire | Entrepôt séparé de la base de production | KÓMBE prêteur |

**Bilan : 3 modules solides, 11 partiels, 5 absents.**

**Points forts rares pour un projet de cette taille :** journal infalsifiable, double contrôle, idempotence, isolation par groupe, accès support encadré. Ce sont justement les exigences financières les plus coûteuses à ajouter après coup.

**Les 5 modules absents ne sont pas des oublis.** Paiements et score ont été exclus par choix (ADR-0005). KYC et marchands découlent du fait que KÓMBE ne manie pas d'argent. Le CRM commercial n'a pas d'objet dans un produit où les groupes s'invitent eux-mêmes.

**Trois manques dans le registre de prêts déjà codé :**

- L'avaliseur est enregistré sans preuve qu'il a accepté.
- Le drapeau `loan_register` est global : l'ouvrir concernerait tous les groupes, alors qu'il faut une activation votée par groupe.
- Aucune route d'écriture n'est ouverte, et le parcours mobile et PWA n'existe pas.

## 4. Les scénarios possibles

Du plus prudent au plus risqué. L'effort est mon estimation pour une petite équipe, à titre d'ordre de grandeur. Il est à refaire après l'avis juridique.

### S1. Prêts internes au groupe

Le groupe prête à ses membres depuis sa caisse, selon ses statuts. KÓMBE tient le registre. C'est une pratique que les tontines connaissent déjà.

- **Argent :** hors de KÓMBE. Promesse intacte.
- **Risque de crédit :** porté par le groupe.
- **Revenu pour KÓMBE :** aucun direct. Valeur de rétention.
- **Effort :** 4 à 8 semaines.
- **Risque principal :** que le groupe soit qualifié d'activité de crédit non agréée, ou KÓMBE de complice.

### S2. Attestation de régularité

Un membre génère, à sa demande, une attestation de son historique (cycles terminés, régularité), vérifiable par empreinte. Il la remet lui-même à qui il veut : banque, microfinance, bailleur.

- **Argent :** aucun.
- **Promesse :** intacte, et ce n'est pas un score.
- **Intérêt :** c'est le test le moins cher de la valeur des données de KÓMBE aux yeux d'un prêteur.
- **Effort :** 2 à 4 semaines. Les exports et empreintes existent déjà.
- **Risque principal :** une attestation qui révèle des données d'autres membres, ou une fausse attestation fondée sur un faux historique.

### S3. Crédit par un partenaire agréé

Une banque ou une microfinance prête. KÓMBE oriente le membre et transmet son dossier s'il y consent.

- **Argent :** entre le partenaire et le membre.
- **Risque de crédit :** porté par le partenaire.
- **Revenu :** commission possible, selon le statut retenu.
- **Effort :** 3 à 6 mois, plus le temps de négociation, souvent le plus long.
- **Risque principal :** être perçu comme le prêteur, et exposer un membre à la loi de 2019 sans qu'il l'ait compris.

### S4. Avance sur le pot, financée par un partenaire

Un membre dont le tour est lointain reçoit tout de suite une avance du partenaire. Il la rembourse quand son tour arrive. C'est le vrai « BNPL de tontine ».

- **Point fort :** répond à un besoin propre à la tontine, avec un remboursement prévisible.
- **Point faible majeur :** la garantie repose sur un pot que KÓMBE ne contrôle pas. Il faut que le groupe remette le pot au partenaire, ce qui suppose un engagement du groupe et sans doute une cession de créance.
- **Effort :** 6 à 12 mois, après S3.
- **Risque principal :** le membre quitte le groupe ou le groupe s'effondre, et un conflit de dette naît au sein du groupe.

### S5. BNPL marchand

Un membre paie un commerçant en plusieurs fois, avec un partenaire. C'est le scénario du cahier des charges.

- **À construire :** marchands, encaissement, commissions, litiges de commande, rapprochement.
- **Lien avec la tontine :** faible. KÓMBE entrerait en concurrence avec des acteurs déjà installés sur le mobile money.
- **Effort :** plus d'un an, équipe dédiée.
- **Risque principal :** une dispersion forte pour un avantage faible.

### S6. KÓMBE prêteur

KÓMBE obtient un agrément de microfinance et prête sur ses fonds.

- **Capital minimum :** 300 millions de FCFA en 2e catégorie (environ 457 000 €) et 150 millions en 3e catégorie (environ 229 000 €), d'après des sources secondaires concordantes. Les libellés de catégorie sont à confirmer.
- **Promesse :** rompue. Il faudrait réécrire le positionnement de la marque.
- **Effort :** plusieurs années, avec direction des risques, contrôle interne, audit et supervision COBAC.
- **Risque principal :** la perte du capital (section 8).

### Comparaison

| Scénario | Technique | Droit | Économie | Promesse | Avis |
|---|---|---|---|---|---|
| S1 Prêts internes | Facile | À clarifier | Pas de revenu direct | Intacte | **À explorer d'abord** |
| S2 Attestation | Facile | À clarifier | Test à bas coût | Intacte | **À explorer d'abord** |
| S3 Partenaire | Moyen | Statut à définir | Commission possible | Intacte si claire | **Plus tard** |
| S4 Avance sur pot | Difficile | Délicat | Potentiel réel | Fragile | **À étudier après S3** |
| S5 BNPL marchand | Lourd | Lourd | Incertain | Fragile | **Non pour l'instant** |
| S6 KÓMBE prêteur | Très lourd | Agrément | Risque de capital | Rompue | **À écarter** |

## 5. Ce que montrent les précédents

**MoneyFellows, Égypte.** C'est le précédent le plus proche : une application de cercles d'épargne rotatifs qui a intégré le crédit.

- Les membres passent une évaluation de crédit, et un meilleur score donne accès à des pots plus élevés.
- Les premières places coûtent des frais (11 % pour la première place du cycle le plus long, selon son fondateur).
- L'entreprise constitue des réserves pour couvrir les défauts.
- Son fondateur cite l'absence de licence claire comme un de ses plus grands défis, et dit avoir dû en obtenir une auprès de la banque centrale.

**Leçon :** le modèle est viable, mais MoneyFellows gère l'argent et le risque. C'est l'exact opposé de KÓMBE aujourd'hui, et cela a demandé une licence, des réserves et une levée de fonds (31 millions de dollars en 2022). Ces éléments viennent d'articles et de propos du fondateur, pas de son régulateur.

**Kenya.** Ce marché a plusieurs années d'avance sur le crédit numérique.

- La banque centrale y encadre le crédit numérique depuis décembre 2021.
- Des chiffres rapportés par la presse indiquent plus de 80 % de défauts sur les prêts de moins de 1 000 shillings, et jusqu'à 40 % sur l'ensemble des prêteurs numériques. Ils concernent le crédit numérique en général, pas le BNPL.
- Une enquête de 2025 décrit des acteurs du BNPL non régulés, peu transparents sur les taux et qui bloquent des téléphones à distance.

**Leçon :** le petit crédit rapide attire les défauts, puis la régulation arrive. Un produit bâti sur la confiance perdrait beaucoup à être associé à ces pratiques.

**Cameroun.** Le mobile money est très répandu, et un micro-crédit basé sur l'historique mobile money aurait été lancé en 2025 par Orange Bank Africa, d'après un blog que je n'ai pas pu confirmer. Si c'est exact, les opérateurs ont une donnée bien plus forte que KÓMBE : les flux réels.

**Leçon :** l'avantage de KÓMBE n'est pas l'argent ni le volume de données. C'est la preuve sociale du groupe, que les opérateurs n'ont pas.

## 6. La question décisive : la fiabilité des données

Un prêteur achèterait à KÓMBE une seule chose : une information fiable sur le comportement d'un membre. Or cette information a des limites.

| Force | Faiblesse |
|---|---|
| Historique long, daté, infalsifiable après coup grâce au journal | Le journal prouve ce qui a été **déclaré**, pas ce qui a été payé |
| Double contrôle : celui qui confirme n'est pas celui qui déclare | Dans un groupe complice, tout le monde peut confirmer |
| Comportement collectif observable (retards, dettes, litiges) | Pas de lien avec un compte mobile money ou bancaire |
| Pression sociale réelle dans le groupe | Un historique n'a de valeur qu'après plusieurs cycles |

**Le risque de fraude est simple :** cinq complices créent un groupe, déclarent des cotisations jamais versées, se confirment entre eux, puis demandent un crédit avec un excellent historique. Tant que KÓMBE reste un registre sans lien avec les fonds, ce risque ne disparaît pas complètement.

**Réponses à évaluer :**

- Ne compter que les groupes anciens, avec plusieurs cycles terminés.
- Vérifier les paiements sur relevé mobile money fourni par le membre lui-même.
- Repérer les groupes suspects : même appareil, inscriptions simultanées, zéro retard.
- Laisser le prêteur faire sa propre vérification, et ne jamais présenter le registre comme une preuve de solvabilité.

**Un élément nouveau à suivre :** la CEMAC a son premier bureau d'information sur le crédit, Creditinfo Central Africa, agréé par la BEAC en novembre 2025 et lancé à Douala en janvier 2026. Il reçoit des données de banques, de microfinances, d'opérateurs télécoms et de fournisseurs d'eau et d'électricité. Un partenaire pourrait croiser ces données avec l'attestation KÓMBE, mais rien n'indique qu'un acteur comme KÓMBE puisse y contribuer ou le consulter.

## 7. Cadre juridique

Les textes COBAC trouvés en ligne sont surtout des scans illisibles. La plupart des points viennent donc de sources secondaires, et un juriste doit lire les textes officiels.

| Sujet | Ce qui ressort | Fiabilité | Conséquence |
|---|---|---|---|
| Données personnelles (loi n° 2024/017) | Applicable depuis le 23 juin 2026. Transfert hors du Cameroun soumis à autorisation préalable. Opposition possible au profilage. L'autorité (ADCP) n'était pas opérationnelle à la mi-2026 selon une source | Secondaire | **Concerne déjà KÓMBE**, hébergé à Francfort. Sanctions lourdes rapportées, jusqu'à un milliard de FCFA |
| Crédit (loi n° 2019/021) | Vise banques et microfinances. Information avant contrat. Article 20 : 6 mois à 5 ans de prison et/ou amende de 100 000 à 100 millions de FCFA pour l'emprunteur de mauvaise foi, après mise en demeure. Modification annoncée, état inconnu | Secondaire | S1 semble hors champ, à confirmer. En S3, le risque pénal doit être expliqué au membre |
| Microfinance (règlement 01/17) | En vigueur depuis le 1er janvier 2018. Agrément après avis de la COBAC. Distinction entre groupes servant leurs seuls membres et appel au public | Cadre confirmé | La frontière « membres seulement » est sans doute décisive pour S1 |
| Capital minimum (COBAC EMF R-2017/03) | 300 millions (2e catégorie), 150 millions (3e catégorie) | Secondaire, concordant | Barrière d'entrée pour S6 |
| Tontines | Aucun texte spécifique ni exclusion explicite trouvés | **Inconnu** | **Question centrale** |
| Services de paiement (règlement 04/18) | Du 21 décembre 2018. Vise prestataires, partenaires techniques et distributeurs. Un arrêté camerounais précise l'agrément | Champ confirmé, articles non lus | KÓMBE doit rester hors du circuit des fonds. Un partenariat peut faire de lui un « partenaire technique » |
| Bureaux d'information sur le crédit (règlement 03/18) | Cadre des bureaux, Creditinfo agréé en 2025 | Bonne, plusieurs sources dont l'IFC | Utile pour S3 et S4 |
| TEG et usure (règlement 04/19) | Cité par le cahier des charges. Texte et taux en vigueur non trouvés | **Non vérifié** | Des frais fixes peuvent être recalculés en taux |

**Opérateurs agréés comme établissements de paiement au Cameroun :** Orange Money (2022), MTN Mobile Money (2023), Konoom (2026, annonce de l'entreprise). Le statut d'agrégateurs comme Notch Pay, CinetPay ou Smobilpay n'a pas pu être vérifié.

### Questions pour le juriste

1. Un groupe qui prête à ses membres depuis sa caisse fait-il une opération de crédit au sens COBAC ? La fréquence, les frais ou la taille changent-ils la réponse ?
2. Les tontines bénéficient-elles d'une exclusion ou d'une tolérance dans le règlement 01/17 ?
3. KÓMBE, en tenant seulement le registre, peut-il être mis en cause pour participation à une activité non agréée ?
4. Les frais de participation fixes sont-ils soumis au TEG et à l'usure ? Faut-il un plafond dans l'app ?
5. Le registre et l'accord dans l'app ont-ils une valeur de preuve entre membres ? Quelle forme pour la reconnaissance de dette et l'engagement de l'avaliseur ?
6. Quelle attestation un membre peut-il produire sans révéler les données des autres ?
7. En S3, quel statut pour KÓMBE s'il oriente des membres et s'il est rémunéré ?
8. En S4, comment sécuriser le remboursement sur le pot ? Cession de créance, engagement du groupe, autre ?
9. KÓMBE peut-il devenir source de données ou utilisateur du bureau d'information sur le crédit ?
10. L'hébergement à Francfort est-il régularisable alors que l'autorité n'est peut-être pas opérationnelle ? Faut-il un hébergement au Cameroun ?
11. Quelles mentions à l'écran évitent toute confusion sur l'identité du prêteur ?

## 8. Économie

**S1 et S2 ne rapportent rien directement.** Leur valeur est la rétention et la preuve de demande. Ils coûtent surtout du temps de développement et l'avis juridique.

**S3 peut rapporter une commission,** si le statut l'autorise. Son montant dépend du partenaire, et je n'ai aucune donnée fiable.

**S6 expose le capital.** Voici un calcul d'illustration, avec des hypothèses inventées pour montrer le mécanisme, pas pour prévoir.

| Pour 100 millions de FCFA prêtés sur un an | Montant |
|---|---|
| Revenus (hypothèse : 24 %) | + 24 millions |
| Coût de l'argent (hypothèse : 8 %) | − 8 millions |
| Fonctionnement (hypothèse : 10 %) | − 10 millions |
| **Marge avant pertes** | **6 millions** |

Dans cet exemple, l'activité perd de l'argent dès que les pertes dépassent **6 % du portefeuille**. Avec 40 % de défauts, comme dans le pire chiffre kényan cité plus haut, la perte brute pourrait atteindre 34 millions pour 100 millions prêtés. Le taux d'usure, encore inconnu, limite de plus les revenus possibles.

## 9. Risques

| Risque | Gravité | Concerne | Parade |
|---|---|---|---|
| Qualification en activité de crédit non agréée | Élevée | S1 à S4 | Avis juridique avant tout développement |
| Perte de la promesse « KÓMBE ne garde jamais l'argent » | Élevée | S4 à S6 | Rester hors des fonds, nommer le prêteur |
| Faux historiques par des complices | Élevée | S2 à S4 | Section 6 |
| Conflits dans les groupes après un défaut | Élevée | S1, S4 | Plafonds votés, discrétion, avaliseur consentant |
| Surendettement et poursuites pénales de membres | Élevée | S3 à S6 | Information claire, plafonds, pas de relance agressive |
| Transfert de données non autorisé | Élevée | Tous, dès aujourd'hui | Traitement séparé, section 7 |
| Fuite de données plus sensibles | Élevée | S2 à S6 | Clore d'abord les risques R-01 et R-02 du registre |
| Dispersion de l'équipe avant la validation du produit | Moyenne | S3 à S6 | Étapes et seuils, section 10 |
| Dépendance à un seul partenaire | Moyenne | S3, S4 | Contrat réversible, API générique |
| Capacité d'infrastructure | Faible à ce stade | Tous | Palier actuel validé jusqu'à 5 000 membres. Le plan Neon gratuit limite les rafales |

## 10. Trajectoire proposée

**Principe : chaque étape doit gagner le droit de passer à la suivante.** Les seuils sont des propositions à discuter.

| Étape | Contenu | Condition pour passer à la suite |
|---|---|---|
| 0. Assainir | Avis sur l'hébergement et les données, clôture des risques R-01 et R-02 | Position juridique écrite |
| 1. Valider le besoin | Entretiens avec 10 à 20 trésoriers : prêtent-ils déjà, comment, à quelles conditions ? | Besoin confirmé par une majorité |
| 2. Consulter | Les 11 questions à un juriste de droit bancaire CEMAC | Avis favorable pour S1 et S2 |
| 3. Essayer | S1 et S2 sur quelques groupes volontaires, après une ADR et une décision écrite | 6 à 12 mois de données, peu de litiges |
| 4. Tester l'intérêt | Présenter des attestations à 2 ou 3 microfinances | Un partenaire prêt à faire un pilote |
| 5. Élargir | S3 avec un partenaire, puis étude de S4 | Pertes du partenaire acceptables, aucun incident grave |

**Règles produit à garder dans tous les cas :**

- Le groupe décide : il vote l'ouverture, le plafond, les frais et la durée.
- Pas de note de membre visible. `scoring` reste fermé tant qu'une ADR ne l'ouvre pas.
- Celui qui approuve n'est ni le demandeur ni son avaliseur.
- L'emprunteur et l'avaliseur acceptent dans l'app, avec une version conservée.
- Le prêteur est nommé à l'écran, par exemple : « Ce prêt vient de votre groupe. KÓMBE ne prête pas d'argent. »
- Un retard reste discret, visible seulement du bureau, de l'intéressé et de l'avaliseur.
- Jamais « intérêt », « épargne » ni « retrait » dans le produit.

**Ce qu'on reprend du cahier des charges :**

| Maintenant (S1, S2) | Plus tard (S3, S4) | Ne pas reprendre |
|---|---|---|
| Conditions versionnées et preuve d'accord | Vérification d'identité, portée par le partenaire | CRM commercial |
| Double validation | OAuth partenaires, webhooks, bac à sable | Marchands et commissions |
| Échéancier et suivi des retards | Transmission de dossier avec consentement | Orchestration de paiements |
| Registre d'incidents, conservation légale | Détection de fraude de groupe | Moteur de score propriétaire |
| Vue membre pour le support | Traces et alertes renforcées | Architecture à quinze services |

## 11. Décisions à prendre

- [ ] Écarter S6 (KÓMBE prêteur) et mettre S5 (BNPL marchand) de côté
- [ ] Lancer les entretiens avec des trésoriers
- [ ] Mandater un juriste sur les 11 questions
- [ ] Traiter à part l'hébergement et la loi sur les données, sans attendre le crédit

## 12. Limites de ce rapport

- **Droit :** aucune lecture directe des règlements COBAC. Les articles cités viennent de commentaires ou de la presse.
- **Marché :** aucune donnée sur la demande réelle des groupes KÓMBE. Aucun trésorier n'a été interrogé.
- **Code :** revue par recherche et lecture ciblée, pas une relecture complète. Certains états, comme les modèles de messages, restent à confirmer.
- **Registre des risques :** R-01 et R-02 sont repris du dossier du 4 novembre. Des correctifs ont pu arriver depuis.
- **Efforts et seuils :** ce sont mes estimations, pas des engagements.
- **Chiffres de marché :** certains viennent de blogs ou d'articles de presse et se contredisent parfois.

## Sources

**Dans le dépôt :** `docs/adr/0004`, `0005`, `0018`, `0019`, `0030`, `0032`, `0042`, `0045` ; `docs/production-readiness/08`, `12`, `13` ; `packages/db/migrations/0027_association.sql` ; `packages/domain/src/tontine/extensions.ts`.

**Données et crédit au Cameroun**
- [Loi n° 2024/017 en vigueur depuis le 23 juin 2026 (Droit Médias Finance)](https://droitmediasfinance.com/index.php/actualites/droit-tech-fintech/1297-cameroun-la-loi-sur-la-protection-des-donnees-a-caractere-personnel-entre-en-vigueur-ce-23-juin-2026)
- [Répertoire UNGOVR, Cameroun](https://law.ungovr.org/ai/cm)
- [Amendes pour violation des données (Digital Business Africa)](https://www.digitalbusiness.africa/cameroun-bientot-des-peines-damende-d-un-milliard-de-francs-cfa-pour-violation-des-donnees-personnelles/)
- [Loi n° 2019/021 (Juriafrica)](https://www.juriafrica.com/lex/loi-2019-021-24-decembre-2019-49097.htm)
- [Commentaire de la loi de 2019 (Lextenso)](https://www.labase-lextenso.fr/lessentiel-droits-africains-des-affaires/DAA112v0)
- [Projet de modification de la loi de 2019 (Droit Médias Finance)](https://www.droitmediasfinance.com/index.php/actualites/droit-bancaire/663-cameroun-la-loi-de-2019-penalisant-les-non-remboursements-de-credit-bancaire-bientot-amendee)

**CEMAC et COBAC**
- [Règlements de la microfinance (BEAC)](https://www.beac.int/supervision-bancaire/microfinance/reglements-de-microfinance/)
- [Réglementation de la microfinance (BEAC)](https://www.beac.int/supervision-bancaire/microfinance/presentation-de-microfinance/)
- [Capital minimum par catégorie (La Coopérative)](http://www.lacooperative.cm/blog/courrier-des-lecteurs/quel-est-le-capital-social-minimum-des-etablissements-de-microfinance-dans-la-zone-cemac.html)
- [Microfinances agréées au Cameroun (Le Fisk)](https://lefisk.cm/investir/microfinances)
- [Règlement 04/18 (LC-Doc)](https://lc-doc.com/document/reglement-n0418cemacumaccobac-relatif-aux-services-de-paiement-dans-la-communaute-economique-et-monetaire-de-lafrique-centrale)
- [Agrément des prestataires de paiement au Cameroun (Lextenso)](https://www.labase-lextenso.fr/l-essentiel-droits-africains-des-affaires/2025-n5/cameroun-precision-des-modalites-d-agrement-et-de-cessation-d-activites-des-prestataires-de-services-de-paiement-par-voie-electronique-DAA203a0)

**Bureau d'information sur le crédit**
- [Lancement du bureau (IFC)](https://www.ifc.org/fr/pressroom/2026/la-beac-et-la-soci-t-financi-re-internationale-ifc-lancent-officiellement-le-burea0)
- [Creditinfo Central Africa (Creditinfo)](https://www.creditinfo.com/insights/creditinfo-central-africa-begins-operating-cemacs-regional-credit-information-bureau)
- [À quoi servira le bureau (Droit Médias Finance)](https://droitmediasfinance.com/index.php/actualites/droit-bancaire/1168-cemac-a-quoi-servira-le-1er-bureau-dinformation-sur-le-credit-creditinfo-central-africa-sa-agree-par-la-beac-en-2025)

**Paiement et marché camerounais**
- [Agrément d'Orange Money (Financial Afrik)](https://www.financialafrik.com/2022/07/08/cameroun-orange-obtient-lagrement-et-devient-un-etablissement-de-paiement/)
- [Agrément de MTN Mobile Money (EcoMatin)](https://ecomatin.net/mobile-money-corporation-obtient-a-son-tour-son-agrement-detablissement-de-paiement)
- [Agrément de Konoom (EcoMatin)](https://ecomatin.net/communique-cameroun-la-societe-konoom-cameroun-s-a-a-le-plaisir-dannoncer-lobtention-de-son-agrement-en-qualite-detablissement-de-paiement)
- [Marché du mobile money au Cameroun (Simiz, blog commercial)](https://simiz.io/blog/marche-paiement-mobile-cameroun-2026)

**Précédents**
- [MoneyFellows et sa rentabilité (Launch Base Africa)](https://launchbaseafrica.com/2025/10/21/how-money-fellows-hit-profitability-by-digitising-egypts-informal-gameya-and-processing-1-5b)
- [Levée de 31 millions de dollars (TechCrunch)](https://techcrunch.com/2022/10/31/money-fellows-an-egyptian-fintech-digitizing-money-circles-raises-31m-funding)
- [Entretien avec le fondateur (500 Global)](https://500.co/content/egypt-s-money-fellows-uses-an-old-school-lending-tool-to-drive-fintech-innovation)
- [Défauts sur les petits prêts numériques (Business Daily)](https://www.businessdailyafrica.com/bd/economy/borrowers-fail-to-repay-83pc-of-digital-loans-below-sh1000-5189888)
- [Capacité de remboursement au Kenya (TechCabal)](https://techcabal.com/2026/04/21/kenya-wants-lenders-to-prove-borrowers-can-repay-before-approving-loans/)
- [Enquête sur le BNPL au Kenya (TechCabal)](https://techcabal.com/2025/05/16/bnpl-startups-debt-crisis-kenya/)
