# ADR-0024 — Vérification de compte et connexion par code email, sans mot de passe

- **Statut :** ADOPTÉ — décision humaine du 2026-10-07, conçue et prouvée en session
  (Piste A2 suite, `docs/PREUVES_PISTE_A2_ACCESS.md`).
- **Décision concernée :** ferme `OPEN-D06` (fournisseur d'identité) — aucun
  fournisseur tiers (Supabase Auth, Auth.js, etc.) n'est nécessaire : le modèle
  déjà posé par `ADR-0012` (C02) est complété ici par le mécanisme RÉEL de
  preuve d'identité qui lui manquait.
- **Contexte / origine :** `ADR-0012` posait un modèle complet de comptes,
  jetons à usage unique et sessions révocables — mais **sans jamais vérifier
  réellement un code** (le store fictif traitait `tokenId` comme si c'était
  le secret lui-même, jamais haché ; `0003_access.sql` posait déjà la colonne
  `token_hash`, restée inexploitée). Découvert en creusant la Piste A2
  (résolution de session) : impossible de câbler une vraie session sans
  d'abord câbler une vraie preuve d'identité en amont.

## Décision

**Aucun mot de passe.** Toute preuve d'identité (inscription, récupération,
connexion) passe par un **code à usage unique envoyé par email** (Resend,
`ADR-0023`) — jamais un mot de passe à choisir, mémoriser ou faire fuiter.
Justifié par `OPEN-D05` (SMS/OTP écarté pour ce premier déploiement) : email
devient le canal unique, donc autant en faire LE mécanisme de preuve
d'identité plutôt que d'ajouter un mot de passe en plus.

- **Génération** : code numérique à 6 chiffres, `crypto.randomInt` (jamais
  `Math.random`, prévisible). Jamais stocké en clair — seule son empreinte
  SHA-256 (`codeHash`, `packages/domain/src/access.ts`) vit dans
  `verification_token.token_hash` (colonne déjà posée par `ADR-0012`,
  jusqu'ici inexploitée).
- **Comparaison à temps constant** (`timingSafeEqual`) — une comparaison de
  chaînes naïve fuiterait la position du premier caractère différent.
- **Compteur d'essais durable** (`verification_token.failed_attempts`,
  migration `0019_token_security.sql`) : verrouillage après
  `MAX_TOKEN_ATTEMPTS = 5` échecs — un code à 6 chiffres n'a que 10⁶
  possibilités, sans ce verrou un brute-force réseau serait réaliste. Le
  jeton verrouillé répond **à l'identique** d'un code erroné (non-divulgation
  : un attaquant ne distingue pas « encore un essai » de « verrouillé »).
- **Un nouveau code évince l'ancien** par (identité, finalité) — au plus un
  jeton non consommé à la fois (index partiel unique déjà posé par
  `0003_access.sql`).
- **`sessionId` généré SERVEUR** (UUID haute entropie) — jamais fourni par le
  client. *(Le squelette fictif C00 conserve un `sessionId` client pour sa
  recette HTTP existante, volontairement non touché — cf. limites.)*
- **Purpose `login`** ajouté (`migration 0019`, en plus de `registration`/
  `recovery` déjà posés) : lien magique de connexion, même mécanique de
  code+hash+compteur que les deux autres finalités.
- **Contournement RLS structurel résolu** : `access_session`/
  `identity_access` ont une RLS self-scope sur `kombe.identity_id`
  (`0003_access.sql`) — chercher une session par son identifiant est
  impossible sans déjà connaître l'identité recherchée. Résolu par une
  fonction `SECURITY DEFINER` dédiée (`kombe_resolve_session`, migration
  `0018_session_resolver.sql`), même motif déjà prouvé par
  `kombe_c13_dispatch_rights` (C13, migration `0013_outbox.sql`) — sortie
  minimale, jamais un bypass RLS général.

## Conséquences

- `packages/domain/src/access.ts` : `VerificationToken` porte désormais
  `codeHash`/`failedAttempts` ; `TokenPurpose` inclut `login` ;
  `completeRegistration`/`applyAccountRecovery` prennent un jeton **déjà
  vérifié** (séparation stricte entre « vérifier le code » — qui ne lève
  jamais, pour que l'appelant persiste le compteur d'essais même en échec —
  et « appliquer l'effet » métier).
- `packages/api/src/accessStore.ts` (fictif) et `packages/api/src/db/
  pgAccessStore.ts` (réel, Neon) implémentent ce contrat ; `packages/api/src/
  email/emailSender.ts` fournit l'adaptateur (`ResendEmailSender` réel,
  `NullEmailSender` pour les preuves — jamais un envoi réel avant G0).
- Le contrat HTTP change : `registrationVerification`/`recoveryCompletion`
  prennent désormais `code`, jamais `tokenId` (le client ne connaît ni ne
  soumet d'identifiant interne de jeton).
- `OPEN-D06` est fermé par cet ADR : pas de fournisseur d'identité tiers.

## Alternatives rejetées

- **Mot de passe classique** (`password_hash`, déjà présent au schéma,
  `bcrypt`/`argon2`) — écarté : expérience utilisateur différente de ce que
  `D04`/`D05` sous-entendaient (email comme canal unique), charge
  opérationnelle supplémentaire (politique de robustesse, fuite, réinitialisation)
  sans bénéfice pour un pilote à faible volume.
- **Fournisseur d'identité managé** (Supabase Auth, Auth.js, Neon Auth) —
  écarté : `ADR-0012` avait déjà posé un modèle complet maison ; introduire un
  vendeur supplémentaire n'aurait fait qu'ajouter un compte/une dépendance
  sans combler la vraie lacune (qui était la vérification elle-même, pas le
  modèle).
- **Code à verrouillage permanent après échec** (jamais réémissible) —
  écarté : un nouveau code évince l'ancien (`issueAndStore`), donc un
  utilisateur légitime peut toujours redemander un code frais ; seul le
  jeton CONCERNÉ se verrouille, pas le compte.
