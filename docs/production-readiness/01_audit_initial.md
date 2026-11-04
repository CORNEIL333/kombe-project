# 01 — Audit initial (reconnaissance, 2026-11-04)

Point de départ : branche `claude/continue-previous-a102rx` plus `refonte/premium-photos`. Les deux branches avaient divergé : la seconde portait la refonte mobile, les photos de groupe et une migration `0034_group_photo` en collision de numéro avec `0034_echeances_notifications`, **déjà appliquée en production**.

## Inventaire

| Élément | Constat |
|---|---|
| Monorepo pnpm | `domain` (TS pur), `api` (Fastify), `db` (migrations, `migrate.mjs`), `worker`, `client` (PWA React), `dashboard-core` et 4 consoles (`/bureau`, `/ops`, `/direction`, `/engineering`), `mobile` (Flutter) |
| Données | PostgreSQL 16 (Neon, projet `square-resonance-19892972`, région Francfort). RLS par `kombe.group_id` et `kombe.identity_id`. L'API assume le rôle `kombe_app` (NOLOGIN, `-c role=`). |
| Hébergement | Vercel (fonction unique `api/serverless`, statiques par CDN, tâche planifiée quotidienne) |
| Production au 04/11 | 20 identités, 6 groupes, 14 adhésions, 75 entrées de journal, migrations jusqu'à `0034`, **0 opérateur**, aucune clé MFA ni poivre |
| Tests | 451 tests du domaine, 250 tests de l'API, 26 preuves sur PostgreSQL réel (exécutées localement ; seule l'isolation tournait en CI) |

## Risques immédiats relevés (détail : 02)

1. **Idempotence non atomique** : effet orphelin et double effet possibles (P0).
2. **Refus d'accès support (JIT) perdus** : journalisés dans la transaction annulée (P0).
3. **Opérateurs** : un booléen unique pour toutes les consoles, sans second facteur ni journal propre (P0).
4. **Codes OTP** : SHA-256 simple, et limitation en mémoire par instance serverless, donc inopérante (P0).
5. **`identity` sans RLS** : l'identifiant est le numéro de téléphone ou l'e-mail, énumérable (P0).
6. **API sans journaux** : `logger: false`, les erreurs 500 étaient muettes (P1).
7. **Dépendance `zod` vulnérable** (high) (P1).
8. **Notifications** : uniquement dans l'application, sans préférences, livraison ni heures de silence (P1).
9. **Limitation par IP** : incompatible avec le CGNAT des opérateurs mobiles, la page entière répondait 429 dès environ 92 requêtes par minute (P1).
10. **Accessibilité** : contraste insuffisant sur le texte secondaire, tableaux défilants inaccessibles au clavier (P2).

## Stratégie retenue

L'ordre de traitement est P0 → P1 → P2.

- Chaque correctif est accompagné d'une **preuve exécutée sur PostgreSQL réel**, jamais d'un succès simulé.
- Aucun déploiement public, aucune écriture en production et aucun secret de production n'est posé sans le propriétaire.
- La mise à niveau de la base est répétée sur une **copie** de la production (branche Neon jetable, supprimée ensuite).
