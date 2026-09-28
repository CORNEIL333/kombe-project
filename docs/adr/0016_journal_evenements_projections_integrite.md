# ADR-0016 — Journal d'événements : traç reconstructible et intégrité indépendante

- **Statut :** ADOPTÉ (C11). Logique pure **testée** ; append-only/atomicité DB =
  contrat posé, preuve base réelle **BLOCKED**.
- **Auteur :** Lead technique C11 • **Date :** 2026-09-28
- **Contexte / origine :** Stories 9.1 (journal append-only), 9.2 (chaîne
  d'intégrité, P1 restreinte), 9.3 (timeline), 9.4 (journal métier vs technique),
  9.5 (totaux calculés) ; `ARCHITECTURE_CIBLE.md` §Journal et preuves ; ADR-0003
  (canonicalisation RFC 8785), ADR-0004 (schéma d'événement et chaîne de hash,
  genèse 64 zéros), ADR-0006 (RBAC objet), ADR-0007 (isolation multi-tenant RLS),
  ADR-0014 (versions de règles scellées), ADR-0015 (cycle/tours produisant les
  événements de cotisation). Dépend de C00 (chaîne) et C01 (rôles/RLS).

## Décision
- **Le journal est la source des totaux, jamais l'inverse** (9.5) : aucun champ
  agrégé falsifiable n'est stocké comme vérité. `replayJournal` **reconstruit**
  `validatedNet` et `declaredReserved` par obligation **depuis les seuls
  événements** validés et compensations ; la compensation **retracte** le net sans
  **jamais effacer** l'événement d'origine. Toute somme affichée provient du
  replay, contrôlable ligne à ligne.
- **Replay versionné, jamais silencieux** (contrainte C11) : chaque événement
  porte une `version` ; un rejoueur qui rencontre une version **future inconnue**
  **lève** `REPLAY_VERSION_UNKNOWN` au lieu de deviner. Une évolution du format
  passe par une **migration de payload** et un **nouveau rejoueur**, pas par une
  tolérance muette qui corromprait la reconstruction.
- **Enveloppe scellée = traçabilité couverte par le hash** (9.1) : l'événement
  riche (`sealEventV1`) place acteur interne, **rôle instantané**, **date
  serveur**, commande/corrélation et version de règle **dans le payload haché**.
  Falsifier l'acteur ou l'horodatage **change le hash** : la trace n'est pas un
  champ annexe modifiable, elle est scellée.
- **Vérification indépendante qui ne répare jamais** (9.2/9.4) : `verifyJournal`
  **lit** le contenu et contrôle intégrité de chaque hash, continuité depuis la
  **genèse fixe**, **séquence incrémentale**, puis alignement de chaque
  **checkpoint** sur le hash **effectivement écrit** à sa séquence. Il ne
  recalcule **jamais** une chaîne pour masquer une altération — un recalcul
  « réparant » un hash resterait pris en défaut par le checkpoint externe.
- **Checkpoints HORS des privilèges applicatifs** (9.2) : un `checkpoint` scelle
  un préfixe de chaîne (groupe, seq, headHash) par hash canonique. En base
  (`0007`), la table `checkpoint` est en **écriture refusée à `kombe_app`** et
  **immuable** (trigger). Le hash **seul ne garantit pas l'origine** — c'est la
  **séparation des droits** (l'app ne peut ni poser ni défaire un checkpoint) qui
  rend une réécriture rétroactive détectable.
- **Append-only effectif, pas décoratif** (9.1/9.4) : `journal_append_only`
  (trigger `BEFORE UPDATE OR DELETE`) **et** `REVOKE UPDATE, DELETE ON journal
  FROM kombe_app` retirent à la fois la **capacité** et la **possibilité** de
  modifier une ligne posée par le chemin applicatif. Une opération technique
  exceptionnelle exige une **session de maintenance tracée** posant un drapeau
  explicite (`kombe.allow_journal_maintenance`) — jamais le chemin métier.
- **Timeline en langage clair, filtrée par droits, sans payload brut** (9.1/9.3) :
  `buildTimeline` rend des **libellés lisibles** (jamais le jargon `type` brut),
  **masque totalement** un événement privé (litige) pour un rôle non autorisé
  (présence même retirée, pas un payload amputé), et n'expose dans `summary` que
  des **entiers sûrs**. Le chemin de lecture n'est pas un chemin d'écriture : la
  timeline ne modifie rien.
- **Atomicité événement/projection/outbox** (9.x, 18) : écrire l'événement, la
  projection et l'entrée d'**outbox** dans **une seule transaction** ; un crash
  entre l'événement et l'outbox ne laisse **aucune écriture partielle**
  (`partial_commit_count = 0`, prouvé en base réelle, **BLOCKED** ici).

## Alternatives rejetées
- Stocker des totaux courants « pratiques » et les corriger au besoin — rejeté :
  champ agrégé falsifiable, contredit 9.5 ; les totaux naissent du replay.
- Autoriser l'application à archiver/nettoyer le journal par UPDATE/DELETE —
  rejeté : ouvre une modification silencieuse ; seule une maintenance tracée
  hors chemin applicatif le peut (et reste surveillée).
- Chaîner les hash en interne puis conclure « intègre » — rejeté : un
  administrateur peut recalculer une chaîne ; sans **checkpoint externe hors de
  portée de l'app**, le hash ne prouve pas l'origine (9.2, restrictif P1).
- Exposer le payload brut d'un événement filtré « par sécurité » — rejeté :
  contredit la non-divulgation (9.1/9.3) ; la timeline masque le privé et ne
  rend que des champs entiers sûrs.
- Rejoueur tolérant aux versions inconnues — rejeté : masquerait une migration
  de payload et fausserait la reconstruction ; on lève `REPLAY_VERSION_UNKNOWN`.

## Conséquences
- Logique **pure testée maintenant** : `packages/domain/src/journal.ts` (+19 tests
  domain : enveloppe scellée et couverte par le hash, replay versionné et
  compensation, refus de version/montant invalides, checkpoints scellés,
  vérification qui détecte altération/déchaînement/séquence divergente et
  **refuse de réparer**, timeline filtrée sans divulgation),
  `packages/api/src/journalStore.ts` et routes C11 (`GET …/journal/verify`,
  `GET …/timeline`, `POST …/journal-checkpoints`, `POST …/projections-rebuild`,
  + traces de test `journal-appends`/`journal-tamper-tests`) — 8 tests API
  couvrant C11-REBUILD / C11-TAMPER, la réservation du checkpoint, la timeline
  filtrée et l'absence de divulgation.
- Erreurs **stables ajoutées** : `REPLAY_VERSION_UNKNOWN` (422),
  `CHECKPOINT_MISMATCH` (409) — mapping HTTP dans `server.ts`, référencées dans
  l'enum `ErrorCode` et le résultat `JournalVerifyResult` du contrat OpenAPI.
- RBAC : deux actions déclarées comme **interfaces partagées** — `journal.read`
  (tous les rôles, lecture timeline) et `journal.checkpoint`
  (auditor/secretary/treasurer seulement). Aucune n'accorde d'écriture au journal.
- Contrat DB posé par `0007_event_journal.sql` (**additif** au socle 0001) :
  colonnes d'enveloppe nullables et rejouables, **trigger append-only** +
  **revoke UPDATE/DELETE** pour `kombe_app`, table `checkpoint` (FK composite
  vers `journal`, hashes 64-hex, **revoke écritures** app, trigger d'immutabilité,
  RLS) ; avec son **down**. La preuve **effective** (UPDATE/DELETE d'une ligne
  posée refusés, écriture de checkpoint refusée à l'app, rollback transactionnel
  ⇒ `partial_commit_count = 0` — scénarios C11-APPEND-ONLY / C11-CHECKPOINT /
  C11-ROLLBACK de `tests/isolation.pg.mjs`) reste **BLOCKED** sans PostgreSQL.
- Réutilisation **encadrée** du socle C00 : `sealEvent`/`verifyEventIntegrity`
  (chaîne RFC 8785, genèse 64 zéros — ADR-0004), `canonicalHash` (ADR-0003). Le
  hash d'un événement reste calculé **hors son propre champ `hash`** ; l'enveloppe
  C11 vit dans le payload et ne redéfinit pas le profil de hash.
- **Limites conservées** : la consommation réelle de l'**outbox** et le worker
  sont le lot **C13** ; l'**idempotence** registre complet (same-key/different-body
  409, réservations sous verrou) est le lot **C06** ; la **vérification par tiers**
  avec distribution des checkpoints hors base reste une **opération d'exploitation**
  (C17/C29), pas une capacité activée du pilote. La chaîne d'intégrité 9.2 est
  **P1** : le mécanisme est posé et testé en pur, la promesse « détection d'une
  réécriture rétroactive par un administrateur » dépend des checkpoints **externes**
  hors privilèges — non activée en production au pilote (ADR-0005).
