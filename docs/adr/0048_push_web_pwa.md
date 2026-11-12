# ADR-0048 — Push Web pour la PWA (VAPID)

- **Statut :** ACCEPTÉ
- **Date :** 2026-11-12
- **Auteur :** harnais `claude-code`
- **Complète :** ADR-0044 (livraison des notifications), ADR-0016 (textes génériques)

## Contexte

R-07 : les membres qui utilisent KÓMBE dans le navigateur ne recevaient rien hors de l'application. Le push mobile attend un projet Firebase du porteur. Le Push Web, lui, est un standard (RFC 8030, 8291, 8292) : les navigateurs fournissent le service de notification, et le serveur signe ses envois avec sa propre paire de clés VAPID. Aucun compte tiers n'est nécessaire.

## Décisions

1. **Aucune migration.** `push_device` accepte déjà `platform = 'web'`. Le jeton d'un appareil web est l'abonnement du navigateur (`PushSubscription.toJSON()`), unique comme tout jeton.
2. **Fournisseur combiné.** `CombinedPushProvider` partage les appareils : téléphones vers FCM, navigateurs vers le Push Web. Un fournisseur ne voit jamais les jetons de l'autre (FCM aurait retiré un abonnement web, en le jugeant invalide).
3. **Chiffrement et signature** par la bibliothèque libre `web-push` (MIT, sans coût). Charge utile : titre et texte génériques, lien, type, numéro de notification. Ni montant, ni nom (ADR-0016).
4. **Abonnements morts.** Réponse 404 ou 410, ou abonnement illisible : l'appareil est retiré, jamais réessayé. Erreur passagère : nouvelle tentative par la file habituelle.
5. **Fermé par défaut.** Sans `KOMBE_WEBPUSH_PUBLIC_KEY` et `KOMBE_WEBPUSH_PRIVATE_KEY`, le canal n'existe pas et `GET /v1/push/web-key` répond `null` : la PWA ne propose rien. Rien ne part tant que `KOMBE_NOTIFY_EXTERNAL` n'est pas à `on` (décision du porteur, ADR-0044).
6. **Service de notification minimal.** `sw-notifications.js` affiche la notification et ouvre KÓMBE au clic, sur le même site seulement. Il ne met rien en cache et n'intercepte aucune requête : le comportement hors connexion de la PWA ne change pas.
7. **Consentement.** L'activation passe par la demande d'autorisation du navigateur. Enregistrer l'appareil vaut accord pour le push, comme sur mobile. « Désactiver » se désabonne et retire l'appareil.

## Preuves

- `packages/api/test/webPush.test.ts` : appareils `web` seulement, charge générique, 404/410 et abonnement illisible retirés, 503 réessayé, partage FCM/Web, canal fermé sans clés.
- `packages/client/src/test/pushWeb.test.ts` : indisponible sans clé serveur ; autorisation, abonnement avec la clé VAPID (65 octets), appareil `web` enregistré, désactivation ; refus de l'utilisateur sans enregistrement.
- `web-push` réel : requête chiffrée (`aes128gcm`) et signée VAPID construite hors ligne.
- Preuves PostgreSQL `notificationDelivery`, `serverRealMode`, `tontineApi` vertes.

## Conséquences

- Mise en service : générer la paire de clés et la poser en variables Sensibles (voir 07). Changer de paire invalide les abonnements existants.
- Les textes envoyés restent en français, comme les SMS et e-mails (ADR-0044).
