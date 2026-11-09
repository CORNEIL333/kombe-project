# 05 — Sécurité

## Authentification des membres

- **Code à usage unique** (SMS, WhatsApp ou e-mail via Neon Auth).
  - Stocké en HMAC-SHA256 avec un poivre serveur (`KOMBE_TOKEN_PEPPER`), hors base.
  - Verrouillage après 5 codes faux.
- **Limites partagées en base**, valables quel que soit le nombre d'instances :
  - par identifiant : 6 demandes par heure et 20 vérifications par heure ;
  - par IP : `KOMBE_OTP_IP_LIMIT`, 120 par heure par défaut.
- **Limites en mémoire** par session ou par IP : 120 par minute. Elles sont détaillées dans « Limitation de débit HTTP » plus bas.
- **Session.** Jeton Bearer, résolu à chaque requête, révocable.
  - Résiduel R-01 : le jeton est stocké en clair, voir 02.

## Opérateurs (ADR-0043)

**Fonctions.**
- Les fonctions sont `support`, `operations`, `direction`, `engineering` et `admin`. Chaque console exige la sienne, et le serveur tranche par un 403.
- Attribution : `node packages/db/scripts/grant-operator.mjs <login> --roles=…`, ou `--revoke` pour retirer.

**Second facteur TOTP (RFC 6238).**
- Le secret est scellé en AES-256-GCM avec `KOMBE_MFA_KEY`. En production, une clé absente refuse l'accès (fermé par défaut).
- Un code déjà utilisé ne peut pas être rejoué.
- 10 codes de secours hachés, chacun utilisable une seule fois.
- Au plus 5 échecs par 10 minutes.
- La vérification élève la session pour 12 h.

**Journal append-only** (`operator_audit_log`) : inscription, activation, vérification, échecs, usage d'un code de secours, refus de console.

## Accès support juste-à-temps

- Deux approbateurs distincts sont exigés ; l'auto-approbation est refusée.
- Le délai d'expiration est borné et la révocation est tracée.
- La version attendue est exigée (409 si elle est périmée).
- Les actions financières sont **toujours refusées** et journalisées, même pour un accès accordé.
- Les refus sont durables : ils restent journalisés même après l'annulation de la transaction.

## Base de données

**RLS.**
- Les données des groupes sont filtrées par groupe ; les données personnelles par personne (boîte de réception, préférences, appareils, MFA).
- `identity` : chaque personne ne lit que sa propre ligne.

**Écritures.**
- Les tables sensibles (journal, actes, file d'envoi, rôles opérateurs) n'acceptent que des ajouts, ou sont fermées au rôle applicatif.
- Les écritures passent par des fonctions SECURITY DEFINER, avec `search_path` fixé et EXECUTE accordé uniquement à `kombe_app`.

**Contrôles rejoués à chaque poussée** (preuves sur PostgreSQL réel) :
- isolation entre groupes et absence de fuite par le pool de connexions ;
- immuabilité ;
- double contrôle ;
- recours ;
- outbox ;
- RLS identité et opérateurs.

## Chaîne logicielle

- **Dépendances** : `pnpm audit --prod`, bloquant à partir de high (`security.yml`, hebdomadaire et à chaque poussée). Au 04/11, aucune vulnérabilité connue.
- **Secrets** :
  - gitleaks en CI, avec rapport expurgé ;
  - l'historique git a été balayé localement (clés Neon, Resend, GitHub, AWS, clés privées, URL de base avec mot de passe) : rien trouvé ;
  - aucun fichier de clé n'est suivi (`.jks`, `.pem`, `.env`, `google-services.json`).
- **Installation** : `ignoreScripts: true`. Aucun script d'installation de dépendance n'est exécuté.

## En-têtes et transport

- CSP stricte : `script-src 'self'`. Elle a d'ailleurs bloqué l'injection du scanner d'accessibilité.
- HSTS, `nosniff`, `no-referrer`, `frame-ancestors 'none'`.
- CORS en liste fermée, jamais `*` avec credentials.

## Limitation de débit HTTP

- Seule l'API (`/v1/*`) est comptée. Les fichiers statiques ne consomment aucun budget.
- Seau de 120 requêtes par minute, compté par session, ou par IP pour les requêtes anonymes.
- Plafond de 1200 requêtes par minute par IP, quel que soit le seau : garde-fou contre la rotation de faux jetons.
- Routes d'accès : 30 requêtes par minute par IP.
- Raison : le CGNAT des opérateurs mobiles fait partager une même IP à de nombreux abonnés.
