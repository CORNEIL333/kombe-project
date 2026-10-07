# Preuves & revue — Piste A2 (résolution de session réelle, préprod) · KÓMBE

- **Commit de base (HEAD au moment du travail) :** `64ae8c5fc8f9f156a8f15809c3d8e38ee89aa2ce`
- **Harnais producteur :** `claude-code` (préprod, hors gouvernance de lot H06 — pas de `done` auto-signé)
- **Objet :** Piste A2 — remplacer la résolution d'acteur par en-tête client non vérifié (`server.ts:222-227`, `actorFrom`) par une résolution de session réelle, base réelle, conforme `ADR-0012`.
- **Date :** 2026-10-07
- **Environnement :** Neon réel (branche jetable `preview-piste-a-claude`, même branche que Piste A1).
- **Statut :** incrément réel livré pour la **résolution** (session → identité, identité+groupe → rôles) ; **pas** un câblage complet des routes HTTP (voir §6 Limites, même choix de portée que Piste A1).

## 1. Inspecter

- `packages/api/src/server.ts:222-227` (`actorFrom`) parse `request.headers["x-actor"]` — un JSON **fourni par le client**, jamais vérifié. C'est le vrai obstacle d'A2 identifié en Piste A1 : pas un `SET LOCAL` manquant, une absence totale de résolution serveur.
- Obstacle structurel découvert en creusant : `access_session`/`identity_access` (migration `0003_access.sql`) portent une politique RLS self-scope `USING (identity_id = current_setting('kombe.identity_id', true))`. **Chercher une session par son `session_id` est impossible sans déjà connaître l'identité recherchée** — avec `kombe.identity_id` non posé, `current_setting(..., true)` renvoie `NULL`, et `identity_id = NULL` ne matche jamais rien pour `kombe_app` (NOBYPASSRLS).
- Le dépôt a déjà résolu un problème analogue pour C13 : `kombe_c13_dispatch_rights`/`kombe_c13_replay_rights` (`packages/db/migrations/0013_outbox.sql:118-145`) — fonctions `SECURITY DEFINER`, sortie minimale, `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE` ciblé, re-vérification du contexte transactionnel. **Repris à l'identique**, pas réinventé.
- Résolution du rôle **une fois le groupe connu** (après `set_config('kombe.group_id', ...)`) n'a PAS ce problème : `membership`/`role_assignment` ont une RLS `tenant_isolation` standard sur `group_id`, déjà prouvée par Piste A1 (`pgContributionStore.ts`). Pas de fonction `SECURITY DEFINER` nécessaire pour cette partie.
- Découverte en cours de route, non résolue ici : `role_assignment` n'a **aucune contrainte d'unicité** par `(group_id, membership_id)` — un membre peut légitimement porter plusieurs rôles acceptés simultanément (ex. trésorier ET secrétaire dans un petit groupe). Le domaine pur (`authorization.ts`) ne connaît qu'un `Role` singulier par acteur. **Aucun code existant ne tranche ce cas** (le modèle fictif contourne la question en laissant le client choisir un rôle unique dans son en-tête de test). Signalé en §6 comme point ouvert, pas deviné silencieusement.

## 2. Contractualiser

- **Nouvelle migration** `packages/db/migrations/0018_session_resolver.sql` (+ `.down.sql`) : fonction `kombe_resolve_session(session_id_in text)`, `SECURITY DEFINER`, `SET search_path=pg_catalog,public`, sortie limitée à `identity_id, account_state, is_operator, account_session_generation, recovery_lock_until, session_generation, issued_at, expires_at, revoked_at` — jamais `password_hash`, jamais une ligne complète. `REVOKE ALL FROM PUBLIC` puis `GRANT EXECUTE TO kombe_app` uniquement. Câblée dans `migrate.mjs` et `isolation.pg.mjs` (ordre explicite, comme toutes les migrations de ce dépôt).
- **Nouveau module** `packages/api/src/db/pgSessionResolver.ts` :
  - `resolveSession(client, sessionId, now)` : appelle la fonction, reconstruit `AccessAccount`/`Session` (types `@kombe/domain` inchangés), délègue TOUTE décision de validité à la fonction pure `assertSessionUsable` (déjà testée, déjà utilisée par `FictitiousAccessStore`). Pose `kombe.identity_id` après résolution réussie, pour toute lecture identité-scopée ultérieure dans la même transaction (conforme au commentaire de la migration 0003 elle-même).
  - `resolveGroupActor(client, identityId, groupId)` : appelée après `set_config('kombe.group_id', ...)`, retourne l'**ensemble** des rôles acceptés de l'identité dans ce groupe (pas un choix arbitraire d'un seul) + anti-IDOR (absence d'adhésion active → `FEATURE_PILOT_FORBIDDEN`, même code que groupe inconnu — non-divulgation).
- Aucune règle métier déplacée : `assertSessionUsable` reste la seule autorité sur la validité d'une session.

## 3. Construire & tester (commandes RÉELLEMENT exécutées)

```
pnpm --filter @kombe/api build   → exit 0 (dist/db/pgSessionResolver.js généré)
pnpm -r build                    → exit 0
pnpm -r typecheck                → exit 0
pnpm -r test                     → exit 0 (597+ tests, AUCUNE régression — server.ts/accessStore.ts non touchés)
python COORDINATION_MULTI_HARNESS/verifier_coordination.py   → PASS, exit 0
```

## 4. Éprouver — preuve base réelle (Neon, branche jetable `preview-piste-a-claude`)

Script dédié : `packages/api/test/pgSessionResolver.proof.mjs`. Reconstruit son propre schéma (même ordre DOWN/UP que `isolation.pg.mjs`, étendu à `0018`), insère des fixtures (5 identités/sessions, 1 groupe, 1 adhésion + rôle), puis exerce le resolveur contre de VRAIES transactions :

```
KOMBE_API_DATABASE_URL=postgresql://neondb_owner:***@ep-dry-wildflower-b19ptfwl.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require \
  node packages/api/test/pgSessionResolver.proof.mjs
→ exit 0
```

| ID | Attendu | Obtenu (réel) |
|---|---|---|
| **A2-VALID** | session active, génération à jour → identité résolue | `identityId=idn_valid` ✅ |
| **A2-REVOKED** | session révoquée → `SESSION_INVALID` | ✅ |
| **A2-EXPIRED** | session expirée → `SESSION_INVALID` | ✅ |
| **A2-STALEGEN** | génération de session (1) ≠ génération compte (2, récupération postérieure) → `SESSION_INVALID` | ✅ |
| **A2-UNKNOWN** | `session_id` inconnu → `SESSION_INVALID` (même code que révoquée/expirée, non-divulgation) | ✅ |
| **A2-RLS-DIRECT** | une requête **directe** sur `access_session`, hors fonction, sans `kombe.identity_id` posé → **0 ligne visible** | `rows_visible_without_identity_context=0` ✅ — preuve que SEULE la fonction nommée contourne RLS |
| **A2-GROUPACTOR** | adhésion active + rôle accepté → résolu | `roles=["treasurer"], membershipId=mem_s` ✅ |
| **A2-GROUPACTOR-DENY** | identité sans adhésion dans ce groupe → `FEATURE_PILOT_FORBIDDEN` | ✅ |

**A2-RLS-DIRECT est le scénario le plus important de cette preuve** : il démontre que le bypass RLS introduit par `kombe_resolve_session` est strictement borné à cette fonction — n'importe quelle autre requête sur ces tables reste pleinement soumise à la RLS standard, exactement comme avant cette migration.

## 5. Revue (auto-relecture avant livraison — pas un `done` H06)

Un bug réel trouvé et corrigé par exécution réelle : la fixture `sess_expired` violait la contrainte `CHECK (expires_at > issued_at)` de `access_session` (l'`issued_at` par défaut `now()` tombait APRÈS l'`expires_at` volontairement passé). Corrigé en fixant `issued_at` explicitement dans le passé pour toutes les fixtures.

## 6. Limites assumées (ce que cet incrément NE fait PAS)

- **Non câblé à `server.ts`/HTTP**, même choix de portée qu'A1 : `actorFrom`/`ctxFrom`/`declareCtxFrom` continuent de faire confiance à l'en-tête `x-actor`. Remplacer ça exige de toucher ~chaque route — pas fait ici pour zéro risque sur les 597 tests verts.
- **Point ouvert non résolu : rôle unique vs ensemble de rôles.** `resolveGroupActor` retourne `roles: Role[]` (l'ensemble des rôles acceptés), mais `can(role, action)`/`assertAllowed(role, action)` (`@kombe/domain`) n'acceptent qu'un **seul** rôle. Un membre peut légitimement cumuler plusieurs rôles (schéma le permet, aucune contrainte d'unicité). **Aucune décision n'a été prise ici** sur comment un appelant futur doit réduire cet ensemble à une décision d'autorisation — à trancher avant le câblage HTTP (candidats : élargir `can`/`assertAllowed` pour accepter un ensemble ; ou exiger que le client déclare quel rôle il invoque et le serveur vérifie seulement la légitimité de ce rôle déclaré).
- **MFA, passkeys, `is_operator`-driven privileges** : résolus (champs lus) mais aucune logique d'autorisation supplémentaire construite dessus dans cet incrément.
- **Aucun fichier `harness/` touché.**

## 7. Prochaine dépendance

1. Trancher le point ouvert §6 (rôle unique vs ensemble) — décision humaine ou ADR, pas une supposition de ma part.
2. Unifier l'interface des stores (groupId explicite, cf. `docs/PREUVES_PISTE_A.md` §8) et câbler `resolveSession`/`resolveGroupActor` dans `server.ts`, basculé par variable d'environnement comme prévu pour Piste A1.
3. Répéter la conversion store-par-store pour les 13 stores restants.
