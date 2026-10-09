# KÓMBE — OVERNIGHT PROGRESS (continuity file)

Session: autonomous completion + product-coherence recovery.
Owner asleep until 09:00 Paris. Do NOT ask questions. Keep committing per slice.

## Rollup status
- Branch: `claude/overnight-release` (from `master` + fast-forward merge of `design/refonte-identite-kombe`).
- Design branch pushed to origin to protect prior work.
- Baseline (all green): domain 343 · api 207 · worker 10 · brand 3 · dashboard-core 33 · client 23.

## Environment facts (verified this session)
- node v26.4.0, pnpm 11.24.0, node_modules present.
- Windows host; PowerShell (use `;` not `&&`). No Docker; use Neon for real-DB proofs.
- API real mode only when `KOMBE_API_DATABASE_URL` set (Neon DIRECT endpoint, not pooled).
- Only PgAccessStore / PgContributionStore (declarations) / PgGovernanceStore / PgMetricsStore + a few PG stores are real; many domain stores still in-memory (Fictitious*).

## Product-coherence gap register (owner-reported drift)
Original vision CONFIRMS these are legitimate (not invented):
- C05 §5.3 "ordre des bénéficiaires conforme au **type de tontine** choisi" → tontine TYPE.
- C21 §2.5 Multi-groupes: "membre de plusieurs tontines" consolidated view.
- C01: "Test manuel multi-rôles/multi-groupes"; C21: association supervising up to 50 groups (parent/child).
- Owner example: onboarding after login only offers JOIN; no CREATE tontine, no type, no parrainage, no parent supervision.

### Findings (evidence)
- `packages/domain/src/rotation.ts`: only equal-rotation type modeled.
- `packages/domain/src/group.ts`: lifecycle only; no type / parent / sponsorship fields.
- `packages/api/src/schemas.ts:createGroupBody`: { groupId, minimumMembers?, requiredIndependentRoles? } — no type/parent/sponsor.
- git grep parrain/sponsor/parent/tontineType across packages/apps/docs → 0 hits.
- `packages/mobile/lib/features/groups/groups_screen.dart:67` — ONLY "Join group" button; no create_group_screen.dart.

## Slice log (append as completed)
- [x] Regenerate brand derived tokens (Windows CRLF false-fail in `build-tokens.mjs --check`).
- [x] Domain: tontine type + parrainage + parent/child + multi-membership concepts + tests (`a902ab0`).
- [x] API: createGroup(name/model/type/parent) + join-by-code + sponsorship + discoverable routes; HTTP status map; `onboarding.test.ts` (api 215 green) (`a062b77`).
- [x] DB: migration 0024 (group display_name/tontine_model/rotation_type/parent_group_id/join_code + sponsorship table); registered across 14 proof lists + reverse-down; real Neon proof PASS (`pgOnboardingStore.proof.mjs`) + roles.sql REVOKE mirror (`81f2bd9`).
- [x] Mobile onboarding drift FIXED (`6b8ac25`): after-login flow only offered JOIN. Added Créer (CreateGroupScreen: name+model+rotation-type+optional parent), Découvrir (DiscoverGroupsScreen + parrainage/coopetation dialog, candidate resolved server-side from session), Rejoindre par code. Wired real HttpGroupRepository into AppDependencies.configured() (replaced the mock UnavailableGroupRepository); KombeApiClient wraps top-level JSON arrays under 'items'. flutter test 37 passed / 1 skipped; 0 analyze errors. Contract test `http_group_repository_test.dart` (8).
- [ ] DB: migrations for group.type / parent_group_id / sponsorship; register + reverse-down.
- [ ] API: createGroup(type,parent), join-by-code, discoverable list, sponsorship; wire + tests.
- [ ] Mobile: create-group flow (type + parrainage) + multi-group; wire routes.
- [ ] PWA: onboarding parity.
