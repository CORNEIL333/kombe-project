# 04 — Corrections réalisées (branche `claude/continue-previous-a102rx`)

| Commit | Objet |
|---|---|
| `484a468` | Fusion de `refonte/premium-photos` : photo renumérotée en 0035, les deux formes de notification conservées, mobile 0.7.2+72. Sécurité P0 : idempotence atomique, opérateurs avec rôles et TOTP, journal JIT durable, OTP poivrés, limitation partagée, garde de build. |
| `b621072` | Mobile : sorties d'échec des goldens retirées du suivi git. |
| `09dcc4c` | 0037 : RLS sur `identity`, politique `operator_role` en lecture seule, `auth_rate_limit` sous RLS, registre des migrations fermé, REVOKE miroirs dans `roles.sql`. |
| `badb5a9` | Consoles : écrans du second facteur (inscription, activation, codes de secours, vérification) et fonction exigée par console. |
| `9ee2f21` | Notifications P1 : 0038 (préférences, appareils, outbox, bail, attente croissante), fournisseurs FCM, SMS et e-mail, routes, panneau PWA, ADR-0043 et ADR-0044. |
| `c2c31d9` | DevSecOps : zod 4 et dépendances corrigées, preuves PG complètes et sécurité en CI, journaux structurés, `x-correlation-id`, sonde de schéma. |
| `7ba1437` | Performance : test de charge, pastille légère, index de la boîte de réception, `KOMBE_PG_POOL_MAX`. |
| `4e234d1` | Accessibilité WCAG 2.2 AA (24/24 analyses sans violation automatique). Limitation de débit adaptée au CGNAT. |

## Migrations ajoutées

Toutes les migrations ajoutées sont additives et réversibles. Chaque fichier `.down.sql` refuse de détruire des traces.

| Migration | Contenu |
|---|---|
| `0034_group_photo (+ 0035_member_photo)` | Fusion |
| `0036_securite_operateurs` | `operator_role`, `operator_mfa`, `operator_audit_log`, `auth_rate_limit`, `kombe_operator_status`, `kombe_rate_hit` et `kombe_rate_peek` |
| `0037_rls_identite` | RLS sur `identity`, REVOKE sur `kombe_migration`, `kombe_schema_has` |
| `0038_notifications_livraison` | Préférences, `push_device`, `notification_outbox`, déclencheur, claim et complete, index de la boîte de réception |

## Compatibilité ascendante

- Les migrations 0035 à 0038 ne retirent rien que l'ancien code utilise. Elles ont été appliquées sur une copie de la production, et l'API y répond normalement (voir 06).
- Les anciens hachages de codes OTP restent lisibles jusqu'à leur expiration.
- La PWA et l'application mobile lisent les deux formes de notification : `params`/`target` d'une part, `topic`/`subjectId` d'autre part.
