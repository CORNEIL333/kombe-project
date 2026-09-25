# Prompt H00 — Construire et éprouver la chaîne de validation

**Statut : lot préalable à implémenter. Dépendance : C00 minimal. Porte : G-CONSTRUCTION.** H00 ajoute des exigences de construction ; il ne remplace aucune des 130 entrées métier et ne constitue pas un nouveau composant utilisateur.

Tu construis une chaîne de travail sûre pour les agents qui développeront KÓMBE à zéro. Lis les décisions de la v2, la méthode de gouvernance, les risques RA01–RA18, le renforcement HC01–HC07 et les 20 cas H01–H20. Utilise le socle Python comme référence de protocole, sans considérer son PASS comme une attestation fiable.

## Mission

Créer une infrastructure d’assurance vérifiable avec séparation effective entre code candidat, contrôleur, résultats attendus et droits de publication des preuves. Faire adopter les versions de Spec Kit, des composants ECC et Trail of Bits retenus après un essai fictif. Aucune installation globale massive ni activation implicite de hooks. Si une alternative est préférable, documenter coûts, compatibilité et remplacement du workflow principal.

## Travaux exigés

1. Cartographier confiance, fichiers, comptes, réseau et secrets. Construire le programme témoin sain et des variantes volontairement fautives, dans un environnement local ou CI de test autorisé.
2. Mettre en place contrôleur protégé, environnement éphémère, env explicite et restrictions réseau. Ne pas transmettre le socket de l’hôte ni les clés de release au candidat.
3. Raccorder vraie DB et observateur indépendant ; prouver les contrôles avec fixtures variables. Ne pas remplacer les observations par des valeurs tirées des attentes.
4. Faire dériver identité/version de l’artefact du build, relier suite/contrôleur/run et empêcher la réutilisation d’un rapport pour une autre cible.
5. Installer les approbations authentifiées et protections effectives de la plateforme retenue. Si les permissions ou le plan fournisseur ne permettent pas la protection, livrer BLOCKED avec alternative concrète.
6. Exécuter H01–H20, conserver les preuves et limites. Les scénarios de concurrence et de reprise doivent aussi être rejoués sur le vrai produit quand il existe.
7. Définir le contrat de tâche des agents, budgets, branches et propriétaire des migrations. Évaluer les six futurs skills KÓMBE par cas positifs/négatifs et refus de dépasser leur périmètre.

## Livrables

Configuration d’exécution et CI ; politique de permissions ; versions/commits des outils ; scripts testables ; programme témoin ; adaptateurs ; contrôleur ; modèle de preuve ; résultats H01–H20 ; revue des défauts ; mode d’emploi Windows/Linux selon l’hôte retenu ; retour arrière des installations. Les commandes exactes ne doivent être écrites comme opérationnelles qu’après exécution réelle.

## Conditions d’arrêt et clôture

Un test absent, une identité déclarative ou une preuve produite uniquement par l’agent ne satisfait pas la porte. Aucun assouplissement de suite critique sans revue. Arrêter une boucle qui dépasse le budget ; présenter diagnostic et incrément utile. Aucun achat, paiement ou accès production dans cette phase. Terminer avec fichiers modifiés, commandes exécutées, résultats vérifiables, risques restants et décision proposée. Le passage de G-CONSTRUCTION autorise la construction encadrée, pas un pilote réel.
