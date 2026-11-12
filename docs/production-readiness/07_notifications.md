# 07 — Système de notifications

Le détail de conception est dans l'ADR-0044 ; la preuve est `notificationDelivery.proof.mjs`, 26 contrôles sur PostgreSQL réel.

## Chaîne

1. **Création.** Une action métier appelle `kombe_notify_v2` : une ligne entre dans la boîte de réception. Elle est visible dans l'application et cliquable vers le bon écran (ADR-0042).
2. **Mise en file.** Le déclencheur `kombe_outbox_enqueue` crée une ligne par canal **consenti** :
   - push : seulement si un appareil est enregistré ;
   - SMS : seulement si la personne l'a choisi et que son compte est ouvert par téléphone ;
   - e-mail : seulement si elle l'a choisi et que son compte est ouvert par adresse.
3. **Heures de silence.** Par défaut 21:00–07:00, heure du Cameroun. La ligne part à la fin de la plage. Les types mis en sourdine ne créent aucune ligne.
4. **Déclenchement du répartiteur.**
   - Après chaque écriture validée (`waitUntil`).
   - Par la tâche planifiée quotidienne.
   - Par `/v1/internal/cron/notifications`, filet de sécurité.
5. **Bail.** `FOR UPDATE SKIP LOCKED` : deux instances ne livrent jamais la même ligne, et un bail expiré est repris.
6. **Issues possibles.**
   - `sent`.
   - `retry` : attente de 1, 4, 9 puis 16 minutes.
   - `suppressed`, avec son motif : `EXTERNAL_DISABLED`, `CHANNEL_NOT_CONFIGURED` ou `NO_DEVICE`.
   - `dead`, au 5e essai.

## Contenu

- Hors de l'application, le titre est générique, par type (« Une déclaration attend votre contrôle »…), et le corps dit « Ouvrez KÓMBE pour voir le détail ».
- **Aucun montant, aucun nom** de personne ou de groupe.
- Lien profond `https://…/#/notifications/<id>`. Les données push portent aussi `target`, pour que l'application mobile ouvre l'écran exact.

## Interfaces

- `GET /v1/me/notifications` : liste.
- `GET /v1/me/notifications/unread-count` : pastille, sondée chaque minute.
- `GET` et `PUT /v1/me/notification-preferences`.
- `POST` et `DELETE /v1/me/push-devices` (`platform` : `android`, `ios` ou `web`).
- `GET /v1/push/web-key` : clé publique VAPID du Push Web, `null` tant qu'il n'est pas configuré (A14).
- PWA : Profil, puis « Notifications hors de l'application » (push, « Sur ce navigateur » si le Push Web est configuré, SMS si compte téléphone, e-mail si compte adresse, heures de silence).

## État d'ouverture (décision du propriétaire)

Sans action du propriétaire, **rien ne part** :
- `KOMBE_NOTIFY_EXTERNAL` est absent, donc tout finit `suppressed EXTERNAL_DISABLED` ;
- la trace reste dans `notification_outbox`.

Ouverture progressive :
1. **Push Web (PWA, A14)**, sans compte tiers :
   - générer une paire de clés : `npx web-push generate-vapid-keys` (dans `packages/api`) ;
   - poser `KOMBE_WEBPUSH_PUBLIC_KEY` et `KOMBE_WEBPUSH_PRIVATE_KEY` (Sensitive), et au besoin `KOMBE_WEBPUSH_SUBJECT` (défaut `https://kombe.vercel.app`) ;
   - la PWA propose alors « Sur ce navigateur ». Un abonnement expiré (404/410) est retiré, jamais réessayé.
   - Changer de paire de clés invalide les abonnements existants : chacun réactive sur son navigateur.
2. **Push mobile** :
   - créer un projet Firebase ;
   - poser `KOMBE_PUSH_PROVIDER=fcm` et `FCM_SERVICE_ACCOUNT_JSON` ;
   - ajouter `google-services.json` à l'application Android et y intégrer `firebase_messaging` (travail de code restant).
3. **SMS** : `KOMBE_SMS_PROVIDER` (Africa's Talking). Les envois ont un **coût par message**, et seules les personnes qui ont choisi le SMS en reçoivent.
4. **Ouverture** : `KOMBE_NOTIFY_EXTERNAL=on`.
