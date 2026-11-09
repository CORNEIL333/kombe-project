# Dossier séparé crédit : intégration au plan de vision

Version 0.1 proposée, 6 novembre 2026. Statut : **Proposition**, à adopter par le porteur. Rien de ce dossier n'est implémenté.

## Pourquoi ce dossier

La vision de KÓMBE (`Reference_Kombe_v2.md`, chapitre 23) pose une règle : « Les perspectives de scoring, assurance ou crédit nécessitent un dossier séparé ; une porte paiement franchie ne les autorise pas automatiquement. »

Ce document est ce dossier séparé pour le crédit. Il ajoute à la vision une trajectoire, des portes et des interdits. L'analyse complète se trouve dans `docs/credit/RAPPORT_EXPLORATION_CREDIT.md`.

**Mode d'intégration.** `Reference_Kombe_v2.md` est scellé par `MANIFEST_SHA256.json`. Il n'a pas été modifié. La section « Amendements à reporter » donne le texte exact à ajouter lors de la prochaine révision du dossier, avec une mise à jour du manifeste et une ligne dans `DECISIONS_ET_VERSION.md`.

## Position dans la vision

| Élément de la vision | Ce qu'il dit | Effet sur le crédit |
|---|---|---|
| Chapitre 3, hors première version | Prêts internes, enchères, portefeuille, scoring et paiement automatisé sont exclus mais « restent dans la vision » | Les prêts internes sont bien une évolution prévue |
| Chapitre 23, porte G3 | 30 groupes actifs, trois cycles complets, rétention d'au moins 60 %, litiges sous 2 % | Base de seuils réutilisée pour le partenaire |
| Chapitre 23, porte G4 | Le crédit demande un dossier séparé | Ce document |
| ADR-0005 | `loan` et `scoring` fermés, chaque module a sa propre décision, jamais un simple drapeau | Toute ouverture passe par une ADR |
| ADR-0032 | Registre de prêts fermé tant que le porteur n'a pas décidé par écrit, après revue juridique | Condition de la porte GC1 |
| Promesse de marque | « KÓMBE ne garde jamais l'argent » | Principe non négociable de ce dossier |

## Principes

1. **KÓMBE ne prête pas et ne touche pas l'argent.** Le prêteur est toujours nommé : le groupe ou un partenaire agréé.
2. **Le groupe décide.** Il vote l'ouverture, le plafond, les frais et la durée. KÓMBE ne propose aucun montant.
3. **Pas de note de membre.** KÓMBE produit des faits vérifiables à la demande du membre, jamais un score.
4. **Le membre contrôle ses données.** Rien n'est transmis à un tiers sans son accord explicite, révocable et conservé.
5. **Un retard reste discret.** Il n'est visible que du bureau, de l'intéressé et de son avaliseur.
6. **Le droit passe avant le code.** Aucun développement sans avis écrit sur le scénario visé.

## Trajectoire

| Étape | Contenu | Qui prête | Statut |
|---|---|---|---|
| Crédit 1 | Registre de prêts internes | Le groupe | Proposé |
| Crédit 2 | Attestation de régularité remise par le membre | Personne, c'est une preuve | Proposé |
| Crédit 3 | Orientation vers un partenaire agréé | Le partenaire | À étudier |
| Crédit 4 | Avance sur le pot financée par un partenaire | Le partenaire | À étudier |
| Hors vision | BNPL marchand | Un partenaire | Écarté à ce stade |
| Hors vision | KÓMBE prêteur | KÓMBE | Écarté |

## Portes crédit

Ces portes s'ajoutent à G0–G4 sans les remplacer. Les seuils sont des propositions, sauf ceux repris de G3.

| Porte | Autorise | Conditions |
|---|---|---|
| **GC0 Cadrage** | Études seulement | Position écrite sur l'hébergement et la loi n° 2024/017 ; entretiens avec 10 à 20 trésoriers confirmant le besoin ; juriste CEMAC mandaté |
| **GC1 Registre** | Crédit 1 et 2 sur des groupes volontaires | G1 franchie ; avis juridique favorable ; décision écrite du porteur et ADR adoptée ; activation par groupe votée ; accord de l'avaliseur prouvé ; risques R-01 et R-02 clos |
| **GC2 Partenaire** | Crédit 3 | Conditions chiffrées de G3 tenues ; 6 à 12 mois de registre sans incident grave ; partenaire agréé sous contrat ; statut de KÓMBE confirmé par écrit ; contrôle contre les faux historiques en place |
| **GC3 Avance** | Crédit 4 | GC2 tenue depuis au moins 12 mois ; mécanisme de remboursement sur le pot validé juridiquement ; pertes du partenaire jugées acceptables par lui |

**Une porte peut se refermer.** Un avis défavorable, une fraude organisée ou une hausse nette des litiges referme la porte concernée. Le registre reste alors consultable, sans nouveau prêt.

## Amendements à reporter

**Chapitre 3, « Ce qui reste hors de la première version ».** Ajouter après le paragraphe existant :

> Les prêts internes suivent la trajectoire du dossier séparé crédit (`docs/vision/DOSSIER_CREDIT.md`). KÓMBE y reste un registre : le prêteur est le groupe, ou un partenaire agréé nommé à l'écran.

**Chapitre 23, tableau des étapes ou « Portes harmonisées ».** Ajouter après le paragraphe sur G4 :

> Portes crédit. Le crédit suit quatre portes propres : GC0 cadrage, GC1 registre de prêts internes et attestation, GC2 orientation vers un partenaire agréé, GC3 avance sur le pot. Elles sont définies dans le dossier séparé crédit, s'ajoutent aux portes G0–G4 et ne sont jamais franchies par le seul passage d'une autre porte. Le BNPL marchand et l'activité de prêteur de KÓMBE restent hors de la vision.

**Chapitre 24, décisions et risques.** Ajouter :

| Sujet | Décision à prendre | Responsable |
|---|---|---|
| Crédit | Adopter ou non la trajectoire et écarter KÓMBE prêteur | Porteur |
| Crédit | Qualification juridique des prêts internes de tontine | Juriste CEMAC |
| Données | Transfert hors du Cameroun et loi n° 2024/017 | Porteur et juriste |
| Données | Fiabilité du registre déclaratif pour un tiers | Produit et sécurité |

**`DECISIONS_ET_VERSION.md`.** Ajouter une ligne : « Dossier séparé crédit adopté : trajectoire en quatre étapes et portes GC0 à GC3. »

**`docs/adr/`.** Lors du passage de GC1, créer une ADR qui fait évoluer ADR-0005 et ADR-0032 : activation par groupe, accord de l'avaliseur, écrans et routes.

## Indicateurs à suivre

| Indicateur | Depuis | Sert à |
|---|---|---|
| Part des groupes qui prêtent déjà hors application | GC0 | Prouver le besoin |
| Prêts enregistrés par groupe actif | GC1 | Mesurer l'usage |
| Part des prêts remboursés à l'échéance | GC1 | Évaluer le risque du groupe |
| Litiges liés à un prêt | GC1 | Détecter les conflits |
| Attestations générées, puis acceptées par un tiers | GC1 | Tester la valeur des données |
| Groupes signalés comme suspects | GC2 | Mesurer la fraude |
| Pertes du partenaire, déclarées par lui | GC2 | Décider de la suite |

## Décisions attendues du porteur

- [ ] Adopter ce dossier comme extension de la vision
- [ ] Confirmer l'exclusion du BNPL marchand et de KÓMBE prêteur
- [ ] Lancer GC0 : hébergement, entretiens, juriste
- [ ] Autoriser le report des amendements dans le dossier de référence

## Limites

Les seuils des portes sont des propositions sans donnée terrain. Le cadre juridique repose sur des sources secondaires, listées dans le rapport d'exploration. Aucun trésorier n'a encore été interrogé.
