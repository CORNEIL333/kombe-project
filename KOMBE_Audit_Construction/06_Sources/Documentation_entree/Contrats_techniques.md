# Contrats techniques proposés pour KÓMBE

Version 2.0 proposée — 14 septembre 2026. Ce document décrit un contrat cible, pas une API déjà disponible. Exemples fictifs ; aucun jeton réel. Il complète les chapitres 5 à 14 du document Word.

## 1 Conventions

- Préfixe /v1 ; JSON UTF-8 ; dates ISO 8601 UTC et dates métier Africa/Douala.
- Montants entiers XAF, supérieurs à zéro pour une déclaration ; écritures de compensation portant le signe inverse en interne.
- Identifiants opaques et stables ; vérifier l’appartenance de tout identifiant à son groupe dans la base.
- Authentification adaptée au client : session web sécurisée ou jeton natif protégé. L’utilisateur ne choisit jamais actor_id ou son rôle dans le corps d’une commande.
- Lecture par curseur, limite par défaut 50, maximum proposé 100. Ordre stable par séquence et identifiant. Ces limites sont des choix de conception ajustables.
- Réponses sans champs privés superflus. Les mots de passe, sessions et canaux complets n’entrent jamais dans le journal métier.

## 2 Exemples de commande et réponse

POST /v1/groups/grp_demo/contributions
En-tête Idempotency-Key: cmd_demo_001

```json
{
  "obligation_id": "obl_demo_01",
  "amount_minor": 2000,
  "currency": "XAF",
  "channel": "cash",
  "external_reference": null,
  "external_reference_missing_reason": null,
  "reported_paid_at": "2026-09-14T09:00:00Z",
  "expected_obligation_version": 3
}
```

```json
{
  "id": "con_demo_01",
  "group_id": "grp_demo",
  "obligation_id": "obl_demo_01",
  "state": "declared",
  "amount_minor": 2000,
  "currency": "XAF",
  "object_version": 1,
  "recorded_at": "2026-09-14T09:01:00Z",
  "correlation_id": "req_demo_001"
}
```

La date reported_paid_at est déclarative. recorded_at vient du serveur. Pour le canal électronique, reference absente requiert un motif de vérification ; aucune absence ne se transforme en preuve de paiement. Les commentaires libres ont une longueur bornée et sont échappés à l’affichage.

POST /v1/contributions/con_demo_01/confirmations
Idempotency-Key: cmd_demo_002

```json
{"expected_version": 1, "decision": "confirm", "reason": "Réception vérifiée par le trésorier"}
```

Le serveur calcule les rôles de l’acteur et la nécessité d’un contrôle. Sans contrôleur requis, il écrit confirmation et validation dans la même transaction. Sinon, il reste en confirmed. Une requête de contrôle distincte est nécessaire ; un rôle cumulé n’autorise pas un même utilisateur à tenir deux positions dans ce circuit.

Exemple d’erreur 409 :

```json
{"error":{"code":"VERSION_CONFLICT","message":"Cette opération a changé. Actualisez avant de confirmer.","correlation_id":"req_demo_002","retryable":false}}
```

## 3 Catalogue de routes de référence

| Méthode et route | Usage | Préconditions |
|---|---|---|
| POST /auth/recovery-requests | Demander récupération | Réponse générique, quotas, canal vérifié |
| POST /auth/recoveries | Utiliser jeton | Jeton unique, expiration, révocation sessions |
| GET /me/sessions | Voir sessions | Session actuelle ; métadonnées minimisées |
| DELETE /me/sessions/{id} | Révoquer session | Propriété de la session |
| GET /groups | Lister mes groupes | Adhésions accessibles uniquement |
| POST /groups | Créer en configuration | Utilisateur actif |
| GET /groups/{id} | Lire groupe | Adhésion et périmètre |
| POST /groups/{id}/invitations | Inviter | Administrateur ; quota, jeton expirant |
| POST /invitations/{token}/acceptances | Accepter invitation | Canal vérifié, jeton valide, règles présentées |
| POST /groups/{id}/rule-versions | Proposer règle | Droits, version précédente, motif |
| POST /rule-versions/{id}/acceptances | Accepter une version | Membre concerné ; contenu figé |
| POST /groups/{id}/cycles | Créer cycle | Règles complètes, T = N au pilote |
| POST /cycles/{id}/starts | Démarrer | Membres, ordre et acceptations complets |
| GET /cycles/{id}/obligations | Lire échéances | Accès groupe, pagination |
| POST /groups/{id}/contributions | Déclarer | Obligation, restant, rôle, idempotence |
| POST /contributions/{id}/confirmations | Confirmer ou rejeter | Trésorier indépendant ; état valide |
| POST /contributions/{id}/reviews | Contrôler | Contrôleur indépendant si requis |
| POST /contributions/{id}/reversal-requests | Demander correction | Motif, original validé et non compensé |
| POST /contributions/{id}/reversals | Appliquer correction | Circuit indépendant achevé, écriture atomique |
| POST /groups/{id}/disbursements | Déclarer versement au bénéficiaire | Trésorier, tour, montant, frais |
| POST /disbursements/{id}/receipts | Confirmer réception | Bénéficiaire et indépendance requise |
| POST /groups/{id}/proposals | Proposer décision | Objet et électorat figé |
| POST /proposals/{id}/votes | Voter | Électeur éligible, vote unique, délai |
| POST /proposals/{id}/executions | Exécuter décision | Résultat, acceptations, date d’effet |
| POST /groups/{id}/disputes | Ouvrir litige | Objet accessible, motif |
| POST /disputes/{id}/resolutions | Résoudre | Responsables indépendants ; motif et correctifs |
| POST /cycles/{id}/closures | Clôturer | Rapprochement nul, incidents clos |
| POST /cycles/{id}/stops | Arrêter avec écarts | Procédure du groupe et bilan explicite |
| GET /groups/{id}/events | Lire timeline | Projection filtrée, pas charge privée brute |
| POST /groups/{id}/exports | Demander export | Filtre utilisateur, séquence de coupure |
| GET /exports/{id} | État ou téléchargement | Recontrôle des droits à livraison |
| GET /me/notifications | Lire alertes | Propriété utilisateur |
| POST /me/privacy-requests | Exercer un droit | Vérification proportionnée et ticket |

Toutes les mutations métier nécessitent Idempotency-Key et une version attendue de l’objet existant. Les créations utilisent une clé ; leurs préconditions sur un parent utilisent une version de parent si elle est nécessaire. Une route DELETE de session n’autorise aucun DELETE de trace financière.

## 4 Idempotence et concurrence

Portée proposée de la clé : acteur authentifié + groupe + type de commande + clé client. Enregistrer empreinte du corps normalisé, état de traitement et réponse stable. La clé n’est pas une preuve d’autorisation : recontrôler les droits avant de rendre une ancienne réponse potentiellement sensible.

Conserver l’identifiant de commande dans le journal aussi longtemps que les événements correspondants. La durée du cache de réponse peut être courte, mais une clé ancienne ne doit pas redevenir une création valide par expiration du cache. Si la réponse a été purgée, reconstruire un résultat autorisé ou retourner un conflit demandant une lecture de statut. Unicité transactionnelle pour empêcher deux traitements concurrents.

Sous verrou de l’obligation, calculer la capacité restante pour nouvelles déclarations : montant dû moins les déclarations actives non rejetées et non compensées, validées ou en cours. Cette réservation empêche deux membres ou deux appareils de soumettre deux fois le même restant. Le restant dû affiché au membre reste fondé sur les montants validés nets ; afficher séparément « en cours de confirmation ». Un rejet libère la réservation. Une compensation et sa déclaration de remplacement sont coordonnées pour ne pas laisser un concurrent consommer la capacité par erreur.

Utiliser une version optimiste ou des verrous de ligne selon la base retenue. L’obligation, l’opération, les événements, la projection et l’outbox sont validés dans une transaction. Un arrêt du serveur entre écriture et réponse n’ajoute pas de deuxième effet lors du rejeu.

## 5 Dictionnaire détaillé

| Entité | Clé et relations | Champs et contrôles |
|---|---|---|
| users | id | display_name, verified_channel_id, locale, status ; identifiants séparés |
| identities | user_id | canaux chiffrés ou protégés, hash indexé si nécessaire, vérification ; accès restreint |
| memberships | id, group_id, user_id | joined_at, ended_at, status ; unicité adhésion courante |
| role_assignments | membership_id, role | starts_at, ends_at, approver_id, delegation_id |
| groups | id | name, currency, timezone, type, state, object_version |
| rule_versions | id, group_id | version, canonical_content, hash, published_at, effective_cycle_id |
| rule_acceptances | rule_version_id, membership_id | accepted_at, evidence_id ; paire unique |
| cycles | id, group_id, rule_version_id | begins_on, ends_on, tours_count, state |
| rounds | id, cycle_id, group_id | position, beneficiary_membership_id, due_at, state |
| obligations | id, round_id, membership_id, group_id | due_amount_minor, currency, grace_until, object_version ; unique tour et membre |
| contributions | id, obligation_id, group_id | amount_minor, channel, external_ref_private, reported_paid_at, actor_id, state, version |
| approvals | id, contribution_id, group_id | actor_id, function, decision, at, version ; unicité fonction selon circuit |
| disbursements | id, round_id, group_id | beneficiary_id, net_amount_minor, group_fees_minor, state, version |
| proposals | id, group_id | type, target_id, rule_version_id, electorate_snapshot, deadline_at, result, effective_at |
| votes | proposal_id, membership_id, group_id | choice, voted_at ; paire unique |
| disputes | id, group_id, target_type, target_id | parties, state, opened_at, resolved_at, restricted_details_id |
| ledger_events | id, group_id, sequence | type, payload_version, actor_id, role_snapshot, recorded_at, correlation_id, hash, previous_hash |
| outbox | id, group_id, event_id | kind, recipient_id, status, attempts, available_at, dedupe_key |
| exports | id, group_id | requester_id, scope, cutoff_sequence, sha256, generator_version, created_at, expires_at |
| privacy_requests | id, user_id | category, verified_at, status, legal_hold_reason, completed_at |
| subscriptions | id, payer_id, scope_id | offer_version, starts_at, ends_at, status ; séparé du pot |

Les clés étrangères métier utilisent le groupe ou une contrainte équivalente pour empêcher la liaison d’un objet à un autre groupe. Les migrations doivent prévoir index de pagination par groupe et séquence, unicité des acceptations/votes/commandes et contrôles de devise/montant. Les champs de mise à jour technique ne permettent pas de réécrire des événements validés.

## 6 Événement canonique

```json
{
  "event_id": "evt_demo_001",
  "group_id": "grp_demo",
  "group_sequence": 18,
  "event_type": "contribution.validated",
  "schema_version": 1,
  "aggregate_type": "contribution",
  "aggregate_id": "con_demo_01",
  "aggregate_version": 3,
  "actor_id": "usr_demo_controller",
  "role_snapshot": "controller",
  "rule_version_id": "rules_demo_v1",
  "recorded_at": "2026-09-14T09:20:00Z",
  "command_id": "cmd_demo_003",
  "correlation_id": "req_demo_003",
  "payload": {"amount_minor": 2000, "currency": "XAF", "obligation_id": "obl_demo_01"},
  "previous_hash": "EXEMPLE_A_CALCULER",
  "event_hash": "EXEMPLE_A_CALCULER"
}
```

Les valeurs d’empreinte sont des marqueurs d’exemple et ne doivent pas être utilisées en production. Spécifier une sérialisation canonique, par exemple un objet UTF-8 avec clés ordonnées, nombres entiers et exclusion du champ event_hash ; figer cette convention et des fixtures avant calcul. Le hash contient previous_hash et l’ensemble des champs signifiants ; aucune donnée personnelle brute ne doit être ajoutée uniquement pour calculer une empreinte.

Familles d’événements : group.created, rules.published, rules.accepted, membership.joined, role.changed, cycle.started, contribution.declared, contribution.confirmed, contribution.validated, contribution.rejected, contribution.reversed, disbursement.declared, disbursement.received, proposal.opened, vote.cast, proposal.closed, decision.executed, dispute.opened, dispute.resolved, cycle.closed, cycle.stopped, export.created. Versionner tout ajout modifiant la reconstruction.

## 7 Manifeste d’export

```json
{
  "export_id":"exp_demo_001",
  "group_id":"grp_demo",
  "cutoff_sequence":18,
  "created_at":"2026-09-14T09:30:00Z",
  "generator_version":"proposal-2.0",
  "files":[{"name":"releve.pdf","sha256":"EMPREINTE_DES_OCTETS_FINALS"}],
  "signature":null
}
```

Le PDF ne contient pas sa propre empreinte ; il peut contenir un identifiant de vérification. Une empreinte conservée dans un manifeste altérable avec le PDF ne démontre pas à elle seule l’origine : prévoir une référence fiable distincte. Une signature n’est ajoutée qu’avec un véritable service de clés et une procédure de vérification, de rotation et de révocation documentée.

## 8 Paiement et IA futurs

Paiement : module isolé, partenaire autorisé après G3 ; identifiant partenaire unique, signature et date des webhooks, déduplication, états pending/succeeded/failed/reversed, gestion des événements hors ordre et rapprochement quotidien. Ne jamais valider depuis le seul retour du navigateur. Les fonds ne transitent pas sur un compte contrôlé par KÓMBE sans analyse formelle. Le périmètre KYC, réclamations, remboursements et responsabilités est contractualisé avant code de production.

IA : liste blanche de requêtes métier, filtre d’accès avant récupération, cache par utilisateur et groupe, date de synchronisation. Les données sensibles de litiges ne sont pas indexées par défaut. L’effacement traite aussi l’index. Les réponses chiffrées utilisent des valeurs structurées validées ; le modèle n’exécute aucune commande.
