# ADR-0042 — Échéances d'acceptation, relances accentuées et notifications cliquables

- **Statut :** ACCEPTÉ (retour du porteur, 20/10/2026 : « pour la charte, tout le
  monde doit accepter ; l'app peut simplement notifier les retardataires à
  fréquence accentuée à l'approche d'une date limite et, s'ils ne le font pas,
  ils seront exclus » ; « les notifications ne sont pas intelligentes et
  cliquables »).
- **Date :** 2026-10-20
- **Auteur :** harnais `claude-code`

## Contexte

Le démarrage du cycle exigeait que **chaque** membre admis ait accepté la
dernière version des statuts, sans échéance, sans relance et sans issue : un
seul membre absent bloquait le groupe indéfiniment (seule sortie : un vote
d'exclusion de 72 h). Les notifications étaient des libellés génériques (souvent
faux : « Nouvelle demande d'adhésion » pour une fonction proposée), non
cliquables, et les rappels de cotisation ne partaient qu'APRÈS l'échéance.

## Décision

1. **Échéance d'acceptation des statuts** (`statutes_deadline`, migration 0034).
   Le bureau la fixe à la publication : 1 à 60 jours (7 par défaut), et choisit
   la conséquence : **exclusion** (par défaut) ou **signalement au bureau**. Un
   membre admis après la publication dispose du même délai depuis son admission.
   Le bureau peut **prolonger** (jamais dans le passé) et **relancer** à la main
   (au plus une fois toutes les 6 h). L'article final des statuts générés énonce
   la règle ; qui publie est réputé accepter le texte qu'il publie.
2. **Relances accentuées** (domaine pur `reminderStage`) : une semaine avant,
   puis chaque jour les trois derniers jours, puis six heures avant ; chaque
   palier une seule fois par personne, aux seuls retardataires.
3. **À l'échéance** : avant tout cycle en cours, les retardataires sont exclus
   (`membership.state = 'revoked'`, fonctions closes, événement
   `statutes.deadline_exclusion` au registre, notification à la personne et au
   bureau). Jamais la présidence. Pendant un cycle, aucune exclusion
   automatique (des remises sont en jeu) : le bureau est prévenu et peut ouvrir
   un vote d'exclusion (ADR-0038). Le cycle démarre dès qu'il ne reste plus de
   retardataire admis ; une demande d'adhésion en attente ne bloque pas.
4. **Notifications précises et cliquables** : types dédiés (`join_request`,
   `admitted`, `rejected`, `role_proposed`, `statutes_*`, `cycle_started`,
   `meeting_opened`, `payout_to_confirm`, `vote_reminder`…) et `params` (nom du
   groupe, échéance, tour, montant restant…) lus **dans l'application
   authentifiée** ; le titre reste sans montant ni nom (ADR-0016). Toute la
   ligne ouvre l'écran concerné (`#/groupe/<id>/<onglet>`) et marque la
   notification lue. Le refus d'adhésion est désormais bien remis.
5. **Rappels avant l'échéance** : cotisation l'avant-veille, la veille et le
   jour même (puis en grâce / en retard) ; séance la veille et le jour même ;
   vote non exprimé dans les dernières 24 h ; fonction proposée non acceptée
   (J+1, J+3, J+7). Produits à la lecture de la boîte et par une **tâche
   planifiée quotidienne** (Vercel Cron, `GET /v1/internal/cron/echeances`,
   protégée par `CRON_SECRET`).

## Conséquences

- Preuve PostgreSQL : `packages/api/test/echeances.proof.mjs` (24 contrôles :
  bornes, publication, relances par palier aux seuls retardataires, relance
  manuelle réservée au bureau, exclusion à l'échéance, registre valide,
  démarrage ensuite, variante « signalement », prolongation, notifications
  précises, refus remis, tâche planifiée protégée).
- Les notifications restent internes à l'application : aucun SMS, e-mail ou
  push n'est envoyé (les canaux ne servent qu'aux codes de connexion). Un push
  Android est une étape ultérieure.
- `CRON_SECRET` doit être posé dans Vercel ; sans lui la route répond 404 et
  seules les lectures de la boîte produisent les relances.
