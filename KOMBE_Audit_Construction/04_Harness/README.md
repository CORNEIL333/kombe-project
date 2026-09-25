# Harness de construction et de validation KÓMBE

**Révision 2.0 : statut du socle.** Les scripts existants restent inchangés. Les renforcements [HC01–HC07](RENFORCEMENT_HARNESS.md) et [20 cas H00](RECETTE_ASSURANCE_CONSTRUCTION.md) sont spécifiés, non implémentés. Un PASS du contrôleur mécanique historique ne suffit plus pour accepter G0. Les résultats applicatifs restent bloqués tant que le produit et son adaptateur ne sont pas raccordés.

Un harness est l'ensemble qui prépare des données, pilote le composant, mesure les résultats et décide si les assertions passent. Ici, il associe prompts, scénarios adverses, oracles indépendants, runner d'adaptateurs et vérification de preuves.

## Ce qui fonctionne immédiatement

Python 3.10 ou supérieur, sans bibliothèque externe. Depuis ce dossier :

```bash
python3 -m unittest -v test_reference.py
python3 oracle_cli.py
python3 run_harness.py --config adapter.example.json --suite scenarios.json --gate G0 --commit unconfigured --out reports/application.json
```

Les deux premières commandes vérifient les oracles et le protocole du matériel livré. La troisième doit sortir **2 / BLOCKED** avec l'adaptateur d'exemple : aucun logiciel KÓMBE n'est connecté. Ce blocage est intentionnel. Ne pas remplacer l'adaptateur par un renvoi constant des attentes pour obtenir du vert.

Sur Windows remplacer `python3` par `py -3` si nécessaire, et adapter la liste `command` dans le JSON. Les scripts ne déploient rien et n'envoient aucune notification réelle.

## Raccordement au vrai projet

C00 fixe stack et commandes. C28 remplace `application_adapter.py` par un pilote de tests applicatifs. Le runner lance un sous-processus par scénario (liste d'arguments, sans shell), lui envoie sur stdin le scénario **sans les attentes**, et attend une ligne JSON sur stdout :

```json
{"scenario_id":"C06-REPLAY","target":"application","commit":"SHA_REEL","observations":{"contribution_count":1}}
```

L'adaptateur initialise les fixtures dans une DB isolée, réalise le cas puis relit des faits via API/SQL. Il doit exécuter les actions décrites dans `description` avec setup synthétique. Les valeurs `observations` proviennent de l'état réel, pas du fichier `scenarios.json`. Les assertions attendues restent dans le processus de contrôle. L'adaptateur peut écrire sur stderr des diagnostics expurgés, jamais les secrets. Un test indépendant doit vérifier son câblage pour éviter qu'il ne vise le mauvais environnement.

Chaque scénario a une isolation indépendante. Pour les tests de course, l'adaptateur lance réellement deux requêtes synchronisées avant le même verrou. Pour crash et atomicité, des points d'injection de panne n'existent que dans le build de test. Pour les contrôles UI/manuels, l'adaptateur importe un rapport vérifié rattaché au commit ; il ne simule pas une observation humaine. Ne pas exposer les hooks de test en production.

Ajouter des assertions secondaires sur event_count, versions, réservations, droits et outbox : les 90 scénarios livrés sont un **socle de recette**, pas une couverture exhaustive ASVS ou de toutes les combinaisons d'états. Chaque critère détaillé du backlog doit être lié à un test dans C28. L'oracle Python livré ne remplace pas une implémentation de domaine testée en conditions de concurrence.

## Exécution réelle et portes

Renseigner `adapter.json` avec le chemin et l'interpréteur du pilote. Le commit est le SHA exact du logiciel testé. Le runner ne considère pas un retour de type `reference` comme résultat applicatif.

```bash
python3 run_harness.py --config adapter.json --suite scenarios.json --gate G0 --commit SHA_REEL --out reports/g0.json
python3 verify_gate.py --manifest evidence.json --suite scenarios.json --commit SHA_REEL
```

Codes : 0 = assertions exécutées et passées ; 1 = défaut/assertion échouée ; 2 = entrée absente, adaptateur bloqué ou preuve incomplète. Un timeout n'est pas un succès. Un scénario manquant ne passe pas. Les résultats d'auto-test ne passent jamais G0.

`evidence.example.json` est volontairement incomplet. Copier sous `evidence.json` et fournir vrais rapports/empreintes, reviewer distinct de l'auteur, décisions juridique/données/support, backup et security review. `verify_gate.py` vérifie la structure, les hashes et le rapport applicatif G0, pas la sincérité du rédacteur ni une certification mondiale. La validation humaine de la preuve reste nécessaire.

## Protocole complémentaire exigé

- Métier : vecteurs de montant et vote, transitions interdites, original/compensation/remplacement, clôture et frais.
- DB réelle : mêmes clés en parallèle, sur-réservation, crash avant/après commit, réutilisation de pool, RLS et FK.
- API : autorisations par objet et période, anti-énumération, validation schémas et pagination stable.
- UI : multi-session, offline, états métier distincts, clavier/TalkBack, zoom et réseau dégradé.
- Fournisseurs : simulateur local puis sandbox contractualisée ; signatures, doublons, pannes et coûts.
- Reprise : restauration DB + objets, purge/révocations, reprise outbox, RPO/RTO chronométrés.
- Sécurité : ASVS applicable, scans et revue indépendante ; intrusion uniquement sur environnement autorisé.

## Mesure et limites

Réseau lent proposé : 400 ms RTT, 1 Mbps descendant, coupures de 30 secondes ; chronométrer reprise et double soumission. Profil charge initial : 10 groupes ×10–12 membres, 30 utilisateurs virtuels, 10 minutes hors échauffement ; p95 serveur <700 ms, erreurs serveur <1 %, zéro écart financier. Ces seuils sont des cibles proposées, aucun benchmark de KÓMBE n'a été exécuté.
