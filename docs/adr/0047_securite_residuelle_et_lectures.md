# ADR-0047 — Sécurité résiduelle (R-01, R-02, V-18), alertes du support et lectures de « mes tontines »

- **Statut :** ACCEPTÉ
- **Date :** 2026-11-11
- **Auteur :** harnais `claude-code`
- **Complète :** ADR-0043 (opérateurs), ADR-0046 (CRM)

## Contexte

Le registre 02 gardait plusieurs risques résiduels : jetons de session en clair (R-01), tables sans règles d'accès par ligne (R-02), lectures en cascade sur « mes tontines » (R-04), envois différés qui attendaient la tâche quotidienne (R-05).

En préparant R-02, une faille plus grave est apparue (V-18). Quatre routes « vie privée » n'exigeaient qu'une session de membre, et l'une d'elles renvoyait les identifiants de connexion de tous les comptes.

## Décisions

1. **V-18 (déployé le 09/11).**
   - Mentions légales, registre des traitements et restauration sont réservés à la fonction `admin`, avec second facteur.
   - La restauration ne répond plus que par des nombres, jamais par des identifiants.
2. **R-01 (0042, déployé).**
   - La base ne garde que `sha256:<empreinte>` du jeton. Un déclencheur hache le jeton à l'insertion, et une contrainte refuse toute valeur qui n'a pas cette forme.
   - Toutes les recherches passent par `kombe_session_key`. Une empreinte volée, présentée comme jeton, ne correspond à rien.
   - Les sessions déjà ouvertes ont été converties sur place, sans déconnecter personne.
   - Le jeton est un UUID aléatoire : un SHA-256 sans sel suffit.
3. **R-02.** Règles d'accès par ligne sur les tables « vie privée » et `pilot_risk` (0042, déployé), puis sur `"group"` (0045). Pour `"group"`, une ligne est visible :
   - dans le contexte du groupe (lecture et écriture) ;
   - par un membre du groupe ;
   - par un opérateur ;
   - pour un groupe découvrable.

   Les accès qui sortent du groupe courant passent par des fonctions SECURITY DEFINER étroites (existence, ascendance, aperçu d'invitation).
4. **Alertes du support (0044).**
   - Une demande ouverte par un membre prévient les opérateurs support, opérations et admin.
   - Une réponse du membre prévient le responsable de la demande, ou à défaut ces mêmes opérateurs.
   - L'alerte ne contient que la référence : ni l'objet, ni le texte.
5. **R-04 (code).** Une seule lecture par groupe remplace cinq lectures : groupe, membres actifs, photo, ma prochaine remise, cycle courant. On passe de 32 à 20 instructions pour un membre de trois groupes, avec des réponses identiques.
6. **R-05 (déployé).** Les envois différés partent au passage d'un membre connecté, au plus une fois par minute et par instance.

## Preuves

- `pgSessionResolver` : R01-STORED-HASHED, R01-HASH-NOT-A-TOKEN, R01-CLEAR-TOKEN-REFUSED.
- `serverRealMode` :
  - A4-PRIVACY-ADMIN-ONLY ;
  - réponses en nombres ;
  - R02-RLS-PRIVACY (aucune ligne lisible sans contexte, groupes compris ; aucune écriture au nom d'un autre).
- `crm` : CRM-ALERT-NEW-TICKET, CRM-ALERT-REPLY-ASSIGNEE-ONLY.
- 29/29 preuves PostgreSQL, en connexion directe ; via PgBouncer pour les preuves touchées.
- Parcours navigateur de 40 pages sans erreur ni violation d'accessibilité.
- `pg_stat_statements` pour R-04.

## Conséquences

- Pour 0044 et 0045, le déploiement exige une sauvegarde Neon. Le projet est à 10 branches sur 10 : une suppression par le porteur est nécessaire.
- `migrate.mjs down` existe. En production, il exige `KOMBE_CONFIRM_PROD_DOWN`.
- Défaire 0042 obligerait chacun à se reconnecter, car une empreinte ne redevient pas un jeton.
