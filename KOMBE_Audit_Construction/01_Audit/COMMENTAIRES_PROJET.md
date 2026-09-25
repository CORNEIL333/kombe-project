# Commentaires et corrections du projet KÓMBE

Ces commentaires proposent des modifications ciblées. Aucun document d'entrée n'a été modifié et aucun arbitrage n'est considéré approuvé. Les statuts sont « à décider », sauf corrections éditoriales recommandées.

| ID | Emplacement | Commentaire | Formulation ou décision proposée | Responsable / échéance |
|---|---|---|---|---|
| COM01 | Backlog 1.4 | « Actuellement absent du MVP » transforme un constat historique limité en fait actuel. | « Flux de récupération à vérifier dans le dépôt et à implémenter s'il manque. » | Produit / C00 |
| COM02 | Backlog 2.6 | La story annonce 50 groupes ; les critères proposent une entrée à 5. | « Gérer cinq groupes au forfait d'entrée ; extension de capacité et de prix séparée. » | Produit / avant C21 |
| COM03 | Backlog 6.1 | « Avec preuve » laisse penser qu'une preuve externe est authentifiée. | « Déclarer une cotisation avec les informations de versement disponibles ; sans pièce au pilote. » | Produit / avant C06 |
| COM04 | Backlog 14.10 | Story avant G1, critères critiques avant données réelles. | « Revue externe des chemins critiques avant G0 ; élargissement du pentest avant G1. » | Sécurité / C28 |
| COM05 | Backlog 9.6 / 18.17 | Double approbation et approbation par une personne distincte ne sont pas équivalentes. | Proposition : demandeur + deux approbateurs distincts du demandeur pour accès sensible ; lecture bornée ; expiration 30 min ; aucun acte financier. Si équipe insuffisante, support sans accès sensible. | Direction / avant G0 |
| COM06 | Backlog 10.4 | Une phrase de format Word du dossier s'est glissée dans la spécification de l'export produit. | Retirer la phrase ; spécifier A4, taille lisible, coupure et périmètre filtré. | Produit / C12 |
| COM07 | Backlog 12.1 | « Njangi / caisse » peut suggérer un compte détenu par KÓMBE. | Tester « Modèle / Règles / Membres et calendrier / Récapitulatif », avec glossaire local et mention paiements externes. | UX / C14 |
| COM08 | Contrats §6 | Hash d'exemple et sérialisation non définitive. | Choisir un profil canonique versionné et fournir vecteurs de référence ; rejeter une charge qui ne respecte pas le profil. | Lead / C11 |
| COM09 | Contrats §3 | Couverture de commandes incomplète. | Ajouter commandes d'amorçage, rôles, pause, fin d'adhésion, proposition close, réouverture litige, correction décaissement, statut commande et clôture tour. | Backend / C00–C10 |
| COM10 | Référence §17 | Sauvegarde quotidienne insuffisante pour certains engagements reconnus. | ADR : RPO ≤1 h proposé ; garder 24 h uniquement si risque accepté explicitement et protocole de rapprochement opérationnel. | Direction + exploitation / C29 |
| COM11 | Référence §7 | Fondateur seul ne peut nommer tous les approbateurs sans exception d'amorçage. | Configuration non financière ; acceptation explicite des nommés ; activation collective avant tout événement financier. | Produit / C03 |
| COM12 | Backlog 3.3 | « Désactivé par défaut » n'empêche pas l'activation API. | Désactivé serveur au pilote, aucune pénalité comptabilisée sans nouvelle porte métier. | Produit / C04 |
| COM13 | Référence §13 | Brouillons persistants, logout et appareil partagé doivent rester compréhensibles. | Prévenir de la perte locale à la déconnexion ; conserver seulement sous compte/TTL consenti ; mode partagé sans cache. | UX + données / C15 |
| COM14 | Référence §22 | Aide et LLM ont des risques et coûts différents. | Livrer FAQ/requêtes déterministes avant toute expérimentation générative ; jamais d'exécution métier par le modèle. | Produit / après G1 |
| COM15 | Référence §20 | La sécurité nécessaire ne doit pas dépendre du forfait. | Conserver lecture historique autorisée, réclamations et export de base après expiration. | Produit / C19 |
| COM16 | Référence §19 | Dix groupes ne permettent pas d'annoncer une validation statistique du marché. | Présenter nombres bruts et trajectoires ; après dix offres, 25 % exige au moins trois payeurs. | Terrain / pilote |

## Décisions d'architecture à enregistrer

ADR01 réutilisation du dépôt ; ADR02 amorçage des rôles ; ADR03 monnaie et plafonds ; ADR04 verrouillage et réservations ; ADR05 canonicalisation et ancrage ; ADR06 récupération et privilèges ; ADR07 accès historique ; ADR08 cache local ; ADR09 prestataires/pays/contrats ; ADR10 RPO/RTO ; ADR11 coût et offre ; ADR12 support sensible ; ADR13 monétisation séparée ; ADR14 IA ; ADR15 futures opérations réglementées.

Chaque ADR doit contenir : contexte, options comparées, choix, auteur responsable, date, effets métier, coût de sortie, risques, scénarios de recette et statut proposé/adopté/remplacé. Une réponse d'agent IA ne vaut pas adoption par le responsable.

## Commentaires à inscrire dans le code

Commenter les invariants et leur raison, pas chaque instruction : pourquoi un verrou porte sur l'obligation ; pourquoi la reprise garde la même clé ; pourquoi une compensation ne vaut pas remboursement ; pourquoi le snapshot électoral est figé ; pourquoi le support n'est pas un rôle de validation. Chaque commentaire de sécurité renvoie à un ID de règle et à un test. Éviter « sécurisé », « inviolable » et « conforme » sans périmètre de preuve.


## Révision 2.0 et décisions supplémentaires

ADR01 devient « construction neuve » selon décision du porteur. Ajouter ADR16 méthode et versions des outils, ADR17 frontières de confiance du contrôleur, ADR18 identité/provenance des preuves, ADR19 permissions/budgets des agents et ADR20 mise à jour des skills/hooks. Les décisions ADR02–ADR15 ne sont pas automatiquement adoptées.

COM17 : remplacer l’arbitrage réutiliser/refaire par la création du dépôt neuf. COM18 : nommer les outils comme proposés tant que la compatibilité n’est pas testée. COM19 : ne plus présenter un PASS du script verify_gate.py seul comme suffisant pour G0. COM20 : ajouter G-CONSTRUCTION et les 20 cas d’assurance aux preuves de livraison. COM21 : conserver les sources métier initiales avec leur statut historique et traiter les contradictions explicitement.
