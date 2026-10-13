# API « tontine réelle » (v1)

Contrat entre l'API (`packages/api/src/tontine/`), la PWA (`packages/client`), le mobile
(`packages/mobile`) et les dashboards. Types : `packages/domain/src/tontine/dto.ts`.

- Authentification : `Authorization: Bearer <sessionId>` (sauf `/v1/auth/*` et `/v1/health*`).
- Montants : chaînes d'entiers XAF. Dates métier `AAAA-MM-JJ` (Africa/Douala).
- Mutations : en-tête `idempotency-key` accepté (rejeu = même réponse, aucun double effet).
- Erreurs : `{ code, message }` avec un code métier stable (`TONTINE_FORBIDDEN`, `SESSION_INVALID`,
  `VALIDATION`, `APPROVER_NOT_DISTINCT`, `MOVEMENT_STATE_INVALID`, …). 401 session, 403 droits,
  404 objet hors portée (jamais de distinction « existe / n'existe pas » entre groupes), 409 état, 422 saisie.
- Ces routes n'existent qu'en **mode réel** (`KOMBE_API_DATABASE_URL` posée). KÓMBE ne détient
  jamais d'argent : chaque mouvement est la **déclaration** d'un mouvement externe confirmé par des humains.

Vocabulaire : *déclaré* (saisi par une personne) → *confirmé* (reconnu par le trésorier) →
*validé* (contrôlé par le commissaire aux comptes quand le groupe l'exige).

## Accès (téléphone d'abord)

| Méthode | Route | Corps → Réponse |
|---|---|---|
| POST | `/v1/auth/code-requests` | `AuthCodeRequest` → `AuthCodeRequestResult` (202, anti-énumération) |
| POST | `/v1/auth/code-verifications` | `AuthCodeVerification` → `AuthSessionResult` (crée le compte au premier code) |
| POST | `/v1/auth/logout` | → 204 (révoque la session) |
| GET | `/v1/me` | → `MeView` |
| PATCH | `/v1/me` | `MeUpdate` → `MeView` |
| GET | `/v1/me/tontines` | → `TontineSummary[]` |
| GET | `/v1/me/dues` | `?groupId=` → `DueView[]` (mes échéances ouvertes) |
| GET | `/v1/me/notifications` | → `NotificationView[]` |
| POST | `/v1/me/notifications/read` | `{ ids?: string[] }` → 204 (toutes si vide) |

## Association

| Méthode | Route | Rôle | Corps → Réponse |
|---|---|---|---|
| POST | `/v1/tontines` | toute session | `CreateTontineInput` → `TontineDetail` (201). Le créateur devient Président. |
| GET | `/v1/tontines/:id` | membre | → `TontineDetail` |
| PATCH | `/v1/tontines/:id/settings` | bureau (avant démarrage) | `{ name?, settings }` → `TontineDetail` |
| GET | `/v1/tontines/:id/members` | membre | → `MemberView[]` |
| POST | `/v1/tontines/:id/members/offline` | bureau | `{ displayName, proxyMembershipId }` → `MemberView` (membre sans smartphone) |
| POST | `/v1/tontines/:id/members/:mid/admission` | Président / VP | `{ decision: "admit" \| "reject", shares?: number }` → `MemberView` |
| POST | `/v1/tontines/:id/members/:mid/shares` | bureau (avant démarrage) | `{ shares: 1..5 }` → `MemberView` |
| POST | `/v1/tontines/:id/roles` | Président / VP | `{ membershipId, role, mandateEnd? }` → `MemberView` (rôle proposé, accepté par la personne) |
| POST | `/v1/tontines/:id/roles/acceptance` | la personne nommée | `{ role }` → `MemberView` |
| POST | `/v1/tontines/:id/invitations` | bureau | `{ maxUses?: 1..100, days?: 1..30 }` → `InvitationView` |
| GET | `/v1/tontines/:id/invitations` | bureau | → `InvitationView[]` |
| POST | `/v1/tontines/:id/invitations/:iid/revocation` | bureau | → 204 |
| GET | `/v1/invitations/:code` | toute session | → `InvitationPreview` |
| POST | `/v1/invitations/:code/join` | toute session | `{ displayName, sponsorMembershipId? }` → `TontineSummary` (adhésion en attente) |

## Statuts et règlement

| GET | `/v1/tontines/:id/statutes` | membre | → `StatutesView` (dernière version) |
| POST | `/v1/tontines/:id/statutes` | bureau | → `StatutesView` (génère une nouvelle version depuis le règlement) |
| POST | `/v1/tontines/:id/statutes/acceptance` | membre | `{ hash }` → `StatutesView` |

## Cycle, calendrier, ordre de passage

| POST | `/v1/tontines/:id/draws` | bureau | → `{ drawId, commitment }` (graine engagée avant le tirage) |
| POST | `/v1/tontines/:id/cycle` | bureau | `{ order: "draw" \| "manual" \| "join_order", drawId?, membershipOrder?: string[] }` → `TontineDetail` (démarre : tours + séances) |
| GET | `/v1/tontines/:id/rounds` | membre | → `RoundView[]` |
| GET | `/v1/tontines/:id/rounds/:seq/grid` | membre | → `RoundGridView` (transparence appliquée) |
| POST | `/v1/tontines/:id/rounds/:seq/payout` | Trésorier / adjoint | `PayoutInput` → `MovementView` (remise déclarée devant témoins) |
| POST | `/v1/tontines/:id/rounds/:seq/close` | Président / VP / Secrétaire | → `RoundView` (impayés → dettes suivies) |
| GET | `/v1/tontines/:id/draws/:drawId` | membre | → `{ commitment, seed, result }` (rejouable) |
| POST | `/v1/tontines/:id/order-changes` | membre | `{ kind: "swap", seqA, seqB, reason? }` → `OrderChangeView` |
| GET | `/v1/tontines/:id/order-changes` | membre | → `OrderChangeView[]` |
| POST | `/v1/tontines/:id/order-changes/:cid/acceptance` | personne concernée | → `OrderChangeView` |
| POST | `/v1/tontines/:id/order-changes/:cid/approval` | bureau non concerné | → `OrderChangeView` (appliqué) |

## Séances

| GET | `/v1/tontines/:id/meetings` | membre | → `MeetingSummary[]` |
| GET | `/v1/tontines/:id/meetings/:mid` | membre | → `MeetingDetail` |
| POST | `/v1/tontines/:id/meetings/:mid/open` | Président / VP / Secrétaire | → `MeetingDetail` |
| PUT | `/v1/tontines/:id/meetings/:mid/attendance` | bureau, censeur | `{ entries: { membershipId, status, representedByMembershipId? }[] }` → `MeetingDetail` |
| POST | `/v1/tontines/:id/meetings/:mid/close` | Président / VP / Secrétaire | `{ notes? }` → `MeetingDetail` (PV généré, empreinte SHA-256) |
| POST | `/v1/tontines/:id/meetings/:mid/minutes-approval` | Président / VP / Secrétaire | `{ hash }` → `MeetingDetail` |

## Caisses et mouvements

| GET | `/v1/tontines/:id/funds` | membre | → `FundView[]` |
| GET | `/v1/tontines/:id/movements` | membre | `?fundId=&roundSeq=&state=` → `MovementView[]` |
| POST | `/v1/tontines/:id/movements` | membre | `DeclareMovementInput` → `MovementView` (déclaré) |
| POST | `/v1/tontines/:id/movements/confirmations` | Trésorier / adjoint | `{ movementIds: string[] }` → `MovementView[]` (collecte en lot ; jamais sa propre déclaration) |
| POST | `/v1/tontines/:id/movements/:mvid/control` | Commissaire aux comptes | → `MovementView` (validé) |
| POST | `/v1/tontines/:id/movements/:mvid/rejection` | Trésorier / adjoint | `{ reason }` → `MovementView` |
| POST | `/v1/tontines/:id/movements/:mvid/acknowledgement` | bénéficiaire de la remise | → `MovementView` (« j'ai bien reçu ») |

## Discipline, secours, dettes

| GET | `/v1/tontines/:id/fines` | membre | → `FineView[]` |
| POST | `/v1/tontines/:id/fines` | Censeur / Président / VP | `{ membershipId, kind, amount?, reason, meetingId? }` → `FineView` |
| POST | `/v1/tontines/:id/fines/:fid/contest` | membre sanctionné | `{ reason }` → `FineView` |
| POST | `/v1/tontines/:id/fines/:fid/cancel` | Président / VP (≠ émetteur) | `{ reason }` → `FineView` |
| GET | `/v1/tontines/:id/aids` | membre | → `AidView[]` |
| POST | `/v1/tontines/:id/aids` | membre | `{ beneficiaryMembershipId?, event, eventDate, note? }` → `AidView` |
| POST | `/v1/tontines/:id/aids/:aid/decision` | bureau (≠ bénéficiaire) | `{ decision: "approve" \| "reject", note?, overrideAmount?, overrideReason? }` → `AidView` |
| POST | `/v1/tontines/:id/aids/:aid/payout` | Trésorier / adjoint | `{ channel, reference?, justification? }` → `MovementView` |
| GET | `/v1/tontines/:id/debts` | membre (les siennes) / bureau (toutes) | → `DebtView[]` |
| POST | `/v1/tontines/:id/debts/:did/write-off` | Président / VP (≠ débiteur) | `{ reason }` → `DebtView` |

## Registre

| GET | `/v1/tontines/:id/journal` | membre | → `{ valid: boolean, entries: JournalEntryView[] }` (chaîne d'empreintes vérifiée) |
