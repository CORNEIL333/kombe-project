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
- [x] DB: migrations for group.type / parent_group_id / sponsorship; register + reverse-down. (0024, see above)
- [x] API: createGroup(type,parent), join-by-code, discoverable list, sponsorship; wire + tests. (see above)
- [x] Mobile: create-group flow (type + parrainage) + multi-group; wire routes. (see above)
- [x] PWA onboarding drift FIXED + OpenAPI aligned (`4169448`): new « Mes tontines » tab (AmorcageTontine) wires Créer/Rejoindre/Découvrir/Parrainage to the proven 0024 routes via kombeApi (creerTontine/rejoindreParCode/repertorierTontines/demanderParrainage); i18n FR/EN keys; integration test `amorcage.test.tsx` (4). client tsc 0 · vitest 27 · vite build ok. `docs/openapi.yaml`: CreateGroupRequest now requires groupId + model/type/parent/currency/timezone (was a stale `name`-only contract); added /discoverable-groups, /groups/{id}/sponsorships, /groups/{id}/sponsorships/{id}/decision + DiscoverableGroup/Sponsorship(/Request/Decision) schemas.

### Drift register — additional findings (autonomous audit)
- Mobile `screen_manifest.dart` dropped 5 auth screens vs the original 47-screen design (`verify_phone`, `create_pin`, `recover_pin`, `recovery_verify`, `change_pin`) — retired during the earlier email-code auth refactor; the orphan gate `packages/mobile/tool/verify_manifest.py` still hardcodes `expected = 47` (NOT wired to CI, so it fails silently if run). Left as-is (a deliberate auth-architecture change, not a regression), but flagged for owner awareness.
- PWA `ParcoursGuide` (C14) is an inert prototype — `onSoumettre` was never wired to the backend; its model vocabulary (`rotation|caisse`) predates the real domain models. The NEW `AmorcageTontine` tab calls the proven API; `ParcoursGuide` kept untouched so its locked C14 a11y/BACK tests stay green.

## Auth/session flow audit (owner's "première connexion" entry surface)
- Mobile auth = COMPLETE and real: `welcome_screen` offers both `Se connecter` (`/login`) and `Créer un compte` (`/register`); `HttpAuthRepository` (registrations/verifications/login-requests/login-completions) injected in `AppDependencies.configured()`; `UnavailableAuthRepository` only in the non-configured fallback.
- Backend auth = COMPLETE and proven (C02/ADR-0024): `/v1/access/registrations(/verifications)`, `/recovery-*`, real `/login-requests`+`/login-completions` (server-generated `sessionId`).
- **DRIFT (fixed this slice):** the PWA `Connexion.tsx` wired ONLY login. A brand-new email could NOT create an account: `pgAccessStore.requestLogin` returns `{accepted:true}` but sends no code and activates nothing for an unknown/inactive identity (anti-enumeration), so `completeLogin` always failed `SESSION_INVALID`. New users were stuck at the code screen.
- Fix: `kombeApi.creerCompte`/`verifierInscription` + `Connexion` mode toggle (Se connecter / Créer un compte) — registration→verification→auto login-chain→server session, all on the proven endpoints. Login-mode selectors unchanged (default tab = Se connecter). New test `connexionInscription.test.tsx` (INSC-REG/VERIF/CHAIN/SESSION). client tsc 0 · vitest 28 · vite build ok.

## Multi-membership « mes tontines » + parent/child surfacing (owner: « membre de plusieurs tontines », « grande tontine qui en supervise »)
- DRIFT (fixed): there was NO endpoint to list the tontines a member belongs to. Backend had full membership model but no consolidated read; neither mobile nor PWA could show « mes tontines ».
- `019f869` domain `MemberGroupSummary` (no financial field) + API `listGroupsForMember` (real + fictitious) + `GET /v1/me/groups` (identity resolved SERVER-side from Bearer, §14 — never a client choice).
- **RLS subtlety (honest fix, not a bypass-to-pass):** `membership` IS under RLS tenant (`0001_init.sql:205`, policy `group_id = current_setting('kombe.group_id')`), so a direct cross-group join returns 0 rows via the app role. Mirrored the audited `kombe_privacy_subject_group` pattern (0020): migration `0025_member_groups.sql` adds a `SECURITY DEFINER` bridge `kombe_member_groups(text)` (owner role bypasses RLS by default; scoped strictly to the server-supplied identity; `REVOKE FROM PUBLIC` + `GRANT EXECUTE kombe_app`; no financial columns). `group` itself is not under RLS.
- Real Neon proof `pgOnboardingStore.proof.mjs` O-MYGROUPS (multi-membership + parent hierarchy + identity isolation + no-money projection) — PASS (PROOF_EXIT=0). Registered 0025 in migrate.mjs + isolation + all 14 API proof lists (DOWN newest-first / UP before roles.sql).
- **Pre-existing latent CI bug fixed:** `migrateEmptyToLatest.pg.mjs` `EXPECTED_JALONS` was 25 but the list has 26 files (0024 added without bump) → would FAIL any real run. Corrected to 27 (with 0025) + comment. api 216 green (incl new `/v1/me/groups` fictitious test).
- PWA « Mes adhésions » mode (`AmorcageTontine`, `mesTontines()` in kombeApi): lists the member's tontines across ALL groups, shows model · rotation · membership state, and surfaces the supervising parent (« supervisée par {id} »). Mode label chosen to avoid the accessible-name collision with the App « Mes tontines » tab. i18n FR/EN. New test AMO-MYGROUPS. client tsc 0 · vitest 29 · vite build ok.
- PENDING (parity): OpenAPI `/v1/me/groups` doc (mgopen) + mobile list-my-groups repo/screen (mgmobile).
