# ADR-0040 — Connexion par e-mail via Neon Auth pendant le MVP (sans domaine e-mail)

- **Statut :** **ACCEPTÉ par le porteur** (15/10/2026 : « pour ce premier MVP on peut utiliser Neon Auth le temps que l'on acquière un nom de domaine »).
- **Date :** 2026-10-15
- **Auteur :** harnais `claude-code`

## Contexte

La connexion par e-mail passait par Resend. Sans domaine vérifié, Resend ne
livre qu'à l'adresse du propriétaire du compte, et refuse un expéditeur
`@gmail.com`. Le SMS (Africa's Talking) n'est pas encore ouvert. Les vrais
membres ne pouvaient donc pas se connecter.

## Décision

- **Neon Auth (Managed Better Auth)** envoie et vérifie le code e-mail à 6
  chiffres (plugin *Email OTP*), depuis l'expéditeur partagé de Neon
  (`auth@mail.myneon.app`) : aucun domaine, aucune clé Resend.
- La PWA, quand `/v1/auth/channels` annonce `neonAuthUrl`, demande le code à
  Neon (`emailOtp.sendVerificationOtp`), le vérifie (`signIn.emailOtp`), lit
  le jeton signé (`token()`) et l'échange contre une **session KÓMBE**
  (`POST /v1/auth/neon-exchange`). Le reste de l'application (sessions,
  RLS, droits) ne change pas : l'identité reste l'adresse e-mail.
- L'API vérifie la signature contre le **JWKS** du projet Neon, l'expiration,
  l'**émetteur** (même origine que `NEON_AUTH_BASE_URL`) et refuse une adresse
  non vérifiée. Échec ⇒ 401 uniforme.
- Activé seulement si `NEON_AUTH_BASE_URL` et `NEON_AUTH_JWKS_URL` sont posés ;
  sinon l'ancienne voie (Resend) reste en place. Le téléphone (SMS) est
  inchangé : Neon Auth ne fait pas de connexion « téléphone d'abord ».
- ~~La CSP autorise `https://*.neon.tech` et `https://*.neon.com` en `connect-src`.~~ (révisé : relais par l'API, voir plus bas)

## Révision du 15/10/2026 — relais par l'API

Mise en ligne : le parcours « navigateur → Neon » reposait sur un **cookie
tiers** (`__Secure-neon-auth.session_token`, `SameSite=None; Partitioned`)
que Safari / iPhone, Firefox strict et la navigation privée bloquent. Le
navigateur ne parle donc plus à Neon :

- `POST /v1/auth/code-requests` (e-mail) : l'API demande le code à Neon
  (`/email-otp/send-verification-otp`, avec l'en-tête `Origin` du domaine de
  confiance, exigé par Neon) ;
- `POST /v1/auth/code-verifications` (e-mail) : l'API vérifie le code chez Neon
  (`/sign-in/email-otp`), lit le jeton (`/token`) avec le cookie reçu côté
  serveur, le vérifie (JWKS, émetteur, adresse vérifiée) et ouvre la session
  KÓMBE ;
- `/v1/auth/channels` renvoie `neonAuthUrl: null` ; `POST /v1/auth/neon-exchange`
  reste disponible ;
- le client Neon (`@neondatabase/auth`) quitte la PWA ; la CSP revient à
  `connect-src 'self'`.

Preuve : `neonAuth.proof.mjs` (faux service Neon : `RELAY-*`) et parcours réel
contre Neon Auth en production (boîte e-mail jetable).

## Conséquences

- Preuve : `packages/api/test/neonAuth.proof.mjs` (PostgreSQL réel, jetons
  signés localement : valide, expiré, autre clé, autre émetteur, adresse non
  vérifiée, même identité quel que soit la casse) — PASS.
- **Non prouvé ici** : l'aller-retour avec un vrai projet Neon Auth (aucun
  accès Neon depuis la session). À vérifier au premier déploiement.
- Neon indique que l'expéditeur partagé sert au démarrage ; la production
  durable demande un SMTP personnalisé. **À l'achat du domaine** : SMTP
  personnalisé dans Neon Auth (ou retour à Resend), puis revue de cette ADR.
- ~~Le client Neon (`@neondatabase/auth`, bêta) est chargé à la demande.~~
  Retiré (révision du 15/10/2026).
