# ADR-0043 — Opérateurs à fonctions distinctes et second facteur, codes poivrés, idempotence atomique

- **Statut :** ACCEPTÉ (mission « KÓMBE production & scale », priorité P0).
- **Date :** 2026-11-04
- **Auteur :** harnais `claude-code`

## Contexte

L'audit initial a relevé quatre défauts de sécurité ou d'intégrité :

1. **Opérateurs.** Un seul booléen `is_operator` ouvrait toutes les consoles. Il
   n'y avait ni second facteur, ni journal propre aux opérateurs.
2. **Codes de connexion.** Ils étaient stockés en SHA-256 simple. Six chiffres
   s'inversent en une fraction de seconde si la base fuit. La limitation de
   débit vivait en mémoire, par instance serverless, donc inefficace contre
   les rafales et les coûts SMS.
3. **Idempotence.** Le rejeu, l'effet et la mémorisation se faisaient dans des
   transactions séparées. Un échec entre l'effet et la mémorisation laissait
   un effet orphelin, puis un double effet au nouvel essai. Deux requêtes
   concurrentes avec la même clé pouvaient aussi s'exécuter toutes les deux.
4. **Accès support (JIT).** Les refus étaient journalisés DANS la transaction
   annulée par le refus : la trace disparaissait. La version attendue n'était
   pas exigée sur l'approbation et la révocation.

## Décision

**Opérateurs.**
- `operator_role` porte des fonctions distinctes : support, operations,
  direction, engineering, admin.
- Chaque console exige la sienne : `/v1/ops/*`, `/v1/metrics/*` et
  `/v1/support/*`.
- La politique RLS est en lecture seule : aucune auto-attribution n'est
  possible, même si l'écriture était accordée.

**Second facteur (TOTP, RFC 6238).**
- Le secret est scellé en AES-256-GCM avec `KOMBE_MFA_KEY`, gardée hors base.
- Un code ne peut pas être rejoué (`last_step`).
- 10 codes de secours sont stockés hachés (HMAC).
- Au plus 5 échecs par 10 minutes.
- La session est élevée pour 12 h.
- Le facteur est obligatoire. Hors production, il peut être désactivé par
  `KOMBE_OPERATOR_MFA=off`. En production, une clé absente refuse l'accès
  (fermé par défaut).

**Journal opérateur.**
- `operator_audit_log` est en ajout seul.
- Il consigne l'inscription, l'activation, la vérification, les échecs, l'usage
  d'un code de secours et les refus de console.

**Codes de connexion.**
- Ils sont stockés en `h2:` = HMAC-SHA256(`KOMBE_TOKEN_PEPPER`,
  `jeton:code`). Les anciens hachages restent lisibles jusqu'à leur
  expiration.
- La limitation de débit est **partagée en base** (`kombe_rate_hit`, fenêtre
  fixe) :
  - 6 demandes par heure par identifiant et N par IP ;
  - 20 vérifications par heure par identifiant.

**Idempotence.**
- Une seule transaction couvre le verrou consultatif (route, clé), le rejeu,
  l'effet et la mémorisation. Les transactions imbriquées deviennent des
  SAVEPOINT (AsyncLocalStorage).
- Preuve : 20 requêtes concurrentes avec la même clé produisent 1 effet et
  19 rejeux. Un échec forcé ne laisse aucun effet orphelin.

**Support (JIT).**
- Les refus sont journalisés dans une transaction distincte, qui survit au 403.
- `if-match-version` est exigé à l'approbation et à la révocation (409 si la
  version est périmée).
- La révocation est tracée.

**Base (0037).**
- `identity` passe sous RLS : l'identifiant y est le login, téléphone ou
  e-mail, et aucune énumération n'est possible.
- Le registre des migrations est fermé au rôle applicatif.

**Déploiement.**
- Le build Vercel de production échoue sans migration, sauf si
  `KOMBE_SKIP_MIGRATIONS=1` est posé explicitement.
- Il échoue aussi sans `KOMBE_MFA_KEY`, `KOMBE_TOKEN_PEPPER` ou `CRON_SECRET`.

## Conséquences

- **Accès des opérateurs existants.** Ils deviennent `admin` à la migration,
  sans perte d'accès. Ils doivent activer leur second facteur à la première
  visite, puis on restreint leurs fonctions avec
  `grant-operator.mjs --roles=…`.
- **Variables à poser par le propriétaire avant le déploiement.**
  `KOMBE_MFA_KEY` (32 octets) et `KOMBE_TOKEN_PEPPER` (au moins 16 caractères)
  doivent être des valeurs aléatoires, jamais commitées.
- **Preuves.** `idempotence`, `operatorSecurity`, `authHardening`,
  `opsConsole` et `serverRealMode` sont vérifiées sur une PostgreSQL réelle.
