# Preuves & revue — Piste A2 suite (accès réel : code+hash, sans mot de passe) · KÓMBE

- **Commit de base (HEAD au moment du travail) :** `01d54530b4cf5f597d81737bc859b68ef9e99cdf`
- **Harnais producteur :** `claude-code` (préprod, hors gouvernance H06 — pas de `done` auto-signé)
- **Objet :** `ADR-0024` — conception + implémentation du mécanisme RÉEL de preuve d'identité (code email+hash, sans mot de passe) manquant à `ADR-0012`, nécessaire pour que `resolveSession` (Piste A2, `docs/PREUVES_PISTE_A2.md`) serve à quelque chose : il fallait qu'une vraie route puisse créer une session en base.
- **Date :** 2026-10-07
- **Décision humaine** (en session, choix explicite parmi 3 options proposées) : concevoir le mécanisme maintenant, code à 6 chiffres par email, hash stocké, lien magique pour la connexion ultérieure — ferme `OPEN-D06`.

## 1. Inspecter — ce qui a été découvert, pas présumé

- `FictitiousAccessStore.login(identityId, sessionId)` ne vérifiait **aucun** mot de passe/OTP/lien : seul `account.state === 'active'` était testé. Le client fournissait `identityId` ET `sessionId` directement dans le corps de la requête.
- `verification_token.token_hash` existait déjà dans le schéma (`0003_access.sql`, C02, **déjà signé done**) mais n'était exploité **nulle part** : ni le domaine pur (`VerificationToken` n'avait pas de champ hash), ni le store fictif (qui traitait `tokenId` comme le secret lui-même).
- Obstacle structurel (déjà documenté en Piste A2 session) : RLS self-scope sur `kombe.identity_id` empêche de chercher une session par son identifiant sans déjà connaître l'identité — résolu par `kombe_resolve_session` (migration `0018`).
- Aucun test existant (domaine ou API) n'exerçait une vérification par hash — seul un `tokenId` connu à l'avance était simulé. Changer cela est une évolution **délibérée et autorisée**, pas une régression : les tests existants ont été réécrits pour refléter le nouveau contrat, pas contournés.

## 2. Contractualiser

### Domaine (`packages/domain/src/access.ts`)
- `TokenPurpose` : `"registration" | "recovery" | "login"` (nouveau : `login`).
- `VerificationToken` : `+codeHash: string`, `+failedAttempts: number`.
- `hashVerificationCode(code)` : SHA-256 hex (même outillage que `canonical.ts`, déjà dans ce fichier du domaine).
- `issueVerificationToken` : prend désormais `code` (généré par l'appelant, jamais retourné), hache en interne.
- `verifyTokenCode(token, submittedCode, now)` : **ne lève jamais** — retourne `TokenVerificationOutcome` (`verified | mismatch | locked | expired | already_used`). Comparaison à **temps constant** (`timingSafeEqual`). Verrouille après `MAX_TOKEN_ATTEMPTS = 5` échecs — même réponse que `mismatch` (non-divulgation).
- `tokenVerificationError(kind)` : centralise le mapping decision→`DomainError`.
- `assertTokenApplicable(token, identityId, purpose)` : précondition de routage, séparée de la vérification du code.
- `completeRegistration`/`applyAccountRecovery` : prennent désormais un jeton **déjà vérifié** (plus de `now` interne pour la conso — faite par `verifyTokenCode`).
- Nouveau code d'erreur stable : `EMAIL_DELIVERY_FAILED` (502).

### Base (`packages/db/migrations/0019_token_security.sql`, additif sur 0003)
- `+failed_attempts integer NOT NULL DEFAULT 0 CHECK (>= 0)`.
- `purpose` CHECK étendu à `'login'`.

### API
- `packages/api/src/email/emailSender.ts` : `EmailSender` (interface), `ResendEmailSender` (réel, jamais exercé par un test), `NullEmailSender` (double, utilisé par le script de preuve — **aucun envoi réel**, `STACK.md` §4).
- `packages/api/src/db/txContext.ts` : `+withIdentityTx` (transaction scopée `kombe.identity_id`, pour les écritures où l'identité est déjà connue de l'appelant).
- `packages/api/src/db/pgAccessStore.ts` (nouveau) : `requestRegistration/verifyRegistration/requestRecovery/completeRecovery/requestLogin/completeLogin/operatorAccess`.
- `packages/api/src/accessStore.ts` (fictif, mis à jour) : même contrat code+hash, `lastIssuedCode(identityId, purpose)` pour l'introspection de test (remplace l'exposition directe de `tokenId`).
- Contrat HTTP changé : `registrationVerification`/`recoveryCompletion` prennent `code`, plus `tokenId` (`packages/api/src/schemas.ts`, `server.ts`).

## 3. Construire & tester (commandes RÉELLEMENT exécutées)

```
pnpm --filter @kombe/domain build && pnpm --filter @kombe/api build   → exit 0
pnpm -r build / typecheck / test                                      → exit 0 partout
python COORDINATION_MULTI_HARNESS/verifier_coordination.py             → PASS, exit 0
```

`packages/domain/test/access.test.ts` : 22 tests (6 nouveaux — hash/mismatch/lockout/purpose login/already-used sur rejeu). `packages/api/test/access.test.ts` : 8 tests (2 nouveaux — code erroné 400, compte reste pending). **Zéro régression** sur les 597+ tests du reste du dépôt.

## 4. Éprouver — preuve base réelle (Neon, branche jetable `preview-piste-a-claude`)

Script dédié : `packages/api/test/pgAccessStore.proof.mjs`, `NullEmailSender` (aucun envoi réel) :

```
KOMBE_API_DATABASE_URL=postgresql://neondb_owner:***@ep-dry-wildflower-b19ptfwl.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require \
  node packages/api/test/pgAccessStore.proof.mjs
→ exit 0
```

| ID | Attendu | Obtenu (réel) |
|---|---|---|
| **A2B-REGISTER** | inscription → code envoyé (double de test) → vérification → compte actif | `state=active` ✅ |
| **A2B-MISMATCH** | code erroné → refusé, le BON code reste utilisable (1 seul essai raté ne verrouille pas) | `mismatchCode=TOKEN_INVALID` puis `state=active` ✅ |
| **A2B-LOCKOUT** | après `MAX_TOKEN_ATTEMPTS` échecs, même le BON code est refusé | `lastCode=TOKEN_INVALID, lockedCode=TOKEN_INVALID` ✅ |
| **A2B-RECOVERY** | récupération → génération de session incrémentée (2), suspension posée | `sessionGeneration=2, recoveryLockUntil≠null` ✅ |
| **A2B-ENUM** | identité inconnue → même réponse `{accepted:true}`, **aucun** envoi | `accepted=true, newEmailsSent=0` ✅ |
| **A2B-SESSIONID** | `sessionId` généré serveur (UUID), jamais prévisible/fourni client | longueur 36 (UUID) ✅ |
| **A2B-LOGIN** | lien magique → session RÉELLE insérée (`access_session`) → résolue par `resolveSession` (Piste A2) | `identityId=alice@example.test` ✅ |

Ce dernier scénario **boucle la Piste A2** : une session issue d'un vrai login réel est effectivement résolue par la fonction `SECURITY DEFINER` construite dans le commit précédent — la chaîne complète (inscription → vérification → connexion → session → résolution) est maintenant prouvée de bout en bout sur Neon.

## 5. Revue (auto-relecture avant livraison — pas un `done` H06)

Deux bugs réels trouvés et corrigés par exécution réelle (pas de simulation) :

- **Bug critique de rollback** : `verifyPending` levait une `DomainError` à l'intérieur de la transaction `withIdentityTx` — le `ROLLBACK` consécutif annulait le compteur d'essais qu'on cherchait justement à rendre durable, **rendant le verrouillage anti brute-force totalement inopérant** (vérifié : `A2B-LOCKOUT` échouait silencieusement, le bon code passait toujours). Corrigé par une architecture à deux phases : `verifyPendingDurable` s'exécute dans SA PROPRE transaction qui **commit toujours** (jamais de throw à l'intérieur) ; le `throw` de l'erreur stable a lieu **après**, hors de toute transaction — rien à rollback.
- **Bug d'unités** : `TOKEN_TTL_SECONDS`/`SESSION_TTL_SECONDS` (valeurs littérales en secondes) étaient additionnées à `this.now()` = `Date.now()` (millisecondes) — un jeton de 900 secondes expirait en réalité après 900 **millisecondes**. Corrigé : constantes renommées `_MS`, valeurs recalculées, `suspensionSeconds` (contrat HTTP public, secondes) converti explicitement en ms avant d'atteindre le domaine.

Ces deux bugs n'auraient **jamais** été détectés sans l'exécution réelle contre Neon (les tests vitest en mémoire ne les révélaient pas, faute de vraies transactions committées/rollback et d'un vrai `Date.now()`).

## 6. Limites assumées (ce que cet incrément NE fait PAS)

- **Non câblé à `server.ts`/HTTP** pour le chemin RÉEL : les routes existantes utilisent toujours `FictitiousAccessStore`. `PgAccessStore` est prouvé en standalone (même choix de portée que Piste A1/A2, zéro risque sur les tests verts).
- **`sessionLogin` HTTP existant accepte toujours un `sessionId` client** (squelette fictif C00, non touché) — `PgAccessStore.completeLogin` génère le sien en interne ; la bascule complète nécessite de remplacer la route, pas seulement le store.
- **Anti-énumération imparfaite côté timing** : `requestRecovery`/`requestLogin` font un travail mesurable (DB+email) uniquement si le compte existe — asymétrie de latence, déjà présente dans le modèle fictif, non corrigée ici (pas de padding à temps constant).
- **`ResendEmailSender` jamais exercé réellement** (aucun envoi avant G0, `STACK.md` §4) — code revu, non testé en conditions réelles.
- **Aucun fichier `harness/` touché.**

## 7. Prochaine dépendance

1. Unifier l'interface des stores fictif/réel et câbler par variable d'environnement (même reste-à-faire que Piste A1/A2).
2. Remplacer `sessionLogin` HTTP pour ne plus accepter de `sessionId` client quand le mode réel est actif.
3. Répéter la conversion store-par-store pour les 13 stores restants.
