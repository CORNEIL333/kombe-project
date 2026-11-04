# ADR-0044 — Livraison des notifications hors application

- **Statut :** ACCEPTÉ (mission « KÓMBE production & scale », priorité P1).
- **Date :** 2026-11-04
- **Auteur :** harnais `claude-code`

## Contexte

Les notifications (ADR-0042) n'existaient que dans l'application : boîte de
réception et pastille. Rien ne prévenait une personne hors de l'application.
Il n'y avait ni préférences, ni heures de silence, ni appareils enregistrés,
ni nouvelles tentatives, ni trace d'envoi.

## Décision

**Source et file d'envoi.**
- La boîte de réception reste la source.
- Un déclencheur (`kombe_outbox_enqueue`) crée **une ligne par canal
  consenti** dans `notification_outbox` (0038).

**Consentement.**
- Le push n'est actif que si la personne a enregistré un appareil :
  l'enregistrement vaut accord, et le push reste désactivable.
- SMS et e-mail sont désactivés par défaut. Le SMS demande un compte ouvert par
  téléphone, l'e-mail un compte ouvert par adresse.

**Heures de silence.**
- Par défaut : 21:00–07:00, heure du Cameroun (`Africa/Douala`).
- La ligne est différée à la fin de la plage, jamais perdue.
- Les types mis en sourdine ne créent aucune ligne.

**Répartiteur.**
- Les lignes sont réclamées par bail (`FOR UPDATE SKIP LOCKED`) : deux
  instances ne livrent jamais la même. Un bail expiré est repris.
- L'envoi se fait hors transaction.
- Issues possibles : `sent`, `retry` (attente de 1, 4, 9 puis 16 minutes),
  `suppressed` (avec un motif) ou `dead` (après 5 essais).

**Déclenchement.**
- Après chaque écriture validée (`waitUntil` sur Vercel).
- Par la tâche planifiée quotidienne, qui traite aussi les échéances.
- Par `/v1/internal/cron/notifications` (CRON_SECRET), filet de sécurité
  appelable par un planificateur externe.

**Fournisseurs.**
- Push : FCM HTTP v1, avec le compte de service `FCM_SERVICE_ACCOUNT_JSON`. Un
  jeton refusé (404 ou 400) est retiré.
- SMS : la frontière d'envoi des codes (Africa's Talking ou passerelle).
- E-mail : Resend.
- Simulateur : hors production seulement, il marque ses envois
  `SIMULATED`.

**Jamais de faux succès.**
- Tant que `KOMBE_NOTIFY_EXTERNAL` ne vaut pas `on`, tout finit `suppressed`
  avec le motif `EXTERNAL_DISABLED`.
- Un canal non configuré finit `suppressed` avec le motif
  `CHANNEL_NOT_CONFIGURED`.

**Texte.**
- Hors application, le texte est générique (ADR-0016) : ni montant, ni nom de
  personne ou de groupe.
- Il porte un lien profond `…/#/notifications/<id>`. Les données push portent
  aussi `target` pour l'application mobile.

**Routes.**
- `GET` et `PUT /v1/me/notification-preferences`.
- `POST` et `DELETE /v1/me/push-devices`.
- `GET /v1/me/notifications/unread-count` (pastille).

## Conséquences

- **Ouverture des envois réels : décision du propriétaire.**
  - Poser `KOMBE_NOTIFY_EXTERNAL=on`.
  - Créer un projet Firebase, puis renseigner `KOMBE_PUSH_PROVIDER=fcm` et
    `FCM_SERVICE_ACCOUNT_JSON`.
  - Ajouter `google-services.json` à l'application Android et y intégrer
    `firebase_messaging`.
  - Les SMS ont un coût par message.
- **Fréquence de la tâche planifiée.** Le plan Vercel Hobby limite les tâches
  planifiées à une par jour. L'envoi après écriture couvre le cas courant. Les
  messages différés (heures de silence, nouvelles tentatives) attendent cette
  tâche ou un appel externe de `/v1/internal/cron/notifications`.
- **Reste à faire.** Le push Web (VAPID) pour la PWA n'est pas encore fait.
- **Preuve.** `notificationDelivery.proof.mjs` : 26 contrôles sur PostgreSQL
  réelle.
