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
| POST | `/v1/auth/neon-exchange` | `{ token }` (jeton Neon Auth signé, e-mail prouvé par Neon) → `AuthSessionResult` (201 ; actif seulement si `NEON_AUTH_JWKS_URL` et `NEON_AUTH_BASE_URL` sont posés ; jeton expiré, d'une autre clé, d'un autre émetteur ou adresse non vérifiée ⇒ 401) — ADR-0040. Avec Neon Auth configuré, `code-requests` / `code-verifications` pour un e-mail sont **relayés par l'API** vers Neon (aucun cookie tiers) ; `channels.neonAuthUrl` vaut `null` |
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
| GET | `/v1/tontines/:id/members` | membre | `?all=1` ajoute les anciens membres (partis, exclus) → `MemberView[]` |
| POST | `/v1/tontines/:id/members/offline` | bureau | `{ displayName, proxyMembershipId }` → `MemberView` (membre sans smartphone) |
| POST | `/v1/tontines/:id/members/:mid/admission` | Président / VP | `{ decision: "admit" \| "reject", shares?: number }` → `MemberView` |
| POST | `/v1/tontines/:id/members/:mid/shares` | bureau (avant démarrage) | `{ shares: 1..5, sharedWith?: membershipId \| null }` → `MemberView` |
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
| POST | `/v1/tontines/:id/rounds/:seq/payout` | Trésorier / adjoint ; Président / VP si toute la trésorerie est le bénéficiaire | `PayoutInput` → `MovementView` (remise déclarée devant témoins ; jamais par le bénéficiaire) |
| POST | `/v1/tontines/:id/rounds/:seq/close` | Président / VP / Secrétaire | → `RoundView` (impayés → dettes suivies) |
| POST | `/v1/tontines/:id/cycle-renewals` | bureau | `{ order, drawId?, membershipOrder?, firstMeetingDate? }` → `TontineDetail` (201 ; quand tous les tours sont clos : nouveau cycle, tours N+1…, ADR-0039) |
| GET | `/v1/tontines/:id/draws/:drawId` | membre | → `{ commitment, seed, result }` (rejouable) |
| POST | `/v1/tontines/:id/order-changes` | membre | `{ kind: "swap" \| "priority", seqA, seqB, reason? }` → `OrderChangeView` (tour prioritaire : `seqA` = mon tour, `seqB` = tour visé, motif obligatoire ; chaque personne déplacée accepte, puis le bureau non concerné approuve) |
| GET | `/v1/tontines/:id/order-changes` | membre | → `OrderChangeView[]` |
| POST | `/v1/tontines/:id/order-changes/:cid/acceptance` | personne concernée | → `OrderChangeView` |
| POST | `/v1/tontines/:id/order-changes/:cid/approval` | bureau non concerné | → `OrderChangeView` (appliqué) |

## Séances

| GET | `/v1/tontines/:id/meetings` | membre | → `MeetingSummary[]` |
| GET | `/v1/tontines/:id/meetings/:mid` | membre | → `MeetingDetail` |
| POST | `/v1/tontines/:id/meetings/:mid/open` | Président / VP / Secrétaire | → `MeetingDetail` |
| PUT | `/v1/tontines/:id/meetings/:mid/attendance` | bureau, censeur | `{ entries: { membershipId, status, representedByMembershipId? }[] }` → `MeetingDetail` |
| POST | `/v1/tontines/:id/meetings/:mid/close` | Président / VP / Secrétaire | `{ notes?, decisions?: string[] }` → `MeetingDetail` (PV généré, empreinte SHA-256) |
| POST | `/v1/tontines/:id/meetings/:mid/minutes-approval` | Président / VP / Secrétaire | `{ hash }` → `MeetingDetail` |

## Caisses et mouvements

| GET | `/v1/tontines/:id/funds` | membre | → `FundView[]` |
| GET | `/v1/tontines/:id/movements` | membre | `?fundId=&roundSeq=&state=&meetingId=&mine=1` → `MovementView[]` |
| POST | `/v1/tontines/:id/movements` | membre | `DeclareMovementInput` → `MovementView` (déclaré) |
| POST | `/v1/tontines/:id/movements/confirmations` | Trésorier / adjoint | `{ movementIds: string[] }` → `MovementView[]` (collecte en lot ; jamais sa propre déclaration) |
| POST | `/v1/tontines/:id/movements/:mvid/control` | Commissaire aux comptes ; Censeur / Président / VP si tous les commissaires sont la personne concernée | → `MovementView` (validé ; jamais son propre mouvement) |
| POST | `/v1/tontines/:id/reserve-distributions` | Trésorier / adjoint (Président / VP pour la remise d'un trésorier unique) | `{ channel, reference?, justification? }` → `{ year, available, shortfall, movements, waiting }` (201 ; réserve de fin d'année rendue, une remise par membre et par exercice, ADR-0039) |
| POST | `/v1/tontines/:id/movements/:mvid/rejection` | Trésorier / adjoint | `{ reason }` → `MovementView` |
| POST | `/v1/tontines/:id/movements/:mvid/acknowledgement` | bénéficiaire de la remise | → `MovementView` (« j'ai bien reçu ») |

## Discipline, secours, dettes

| GET | `/v1/tontines/:id/fines` | membre | → `FineView[]` |
| POST | `/v1/tontines/:id/fines` | Censeur / Président / VP | `{ membershipId, kind, amount?, reason, meetingId? }` → `FineView` |
| POST | `/v1/tontines/:id/fines/:fid/contest` | membre sanctionné | `{ reason }` → `FineView` |
| POST | `/v1/tontines/:id/fines/:fid/cancel` | Président / VP (≠ membre concerné) | `{ reason }` → `FineView` |
| POST | `/v1/tontines/:id/fines/:fid/maintain` | Président / VP (≠ membre concerné) | `{ reason }` → `FineView` (contestation rejetée) |
| GET | `/v1/tontines/:id/aids` | membre | → `AidView[]` |
| POST | `/v1/tontines/:id/aids` | membre | `{ beneficiaryMembershipId?, event, eventDate, note? }` → `AidView` |
| POST | `/v1/tontines/:id/aids/:aid/decision` | bureau (≠ bénéficiaire) | `{ decision: "approve" \| "reject", note?, overrideAmount?, overrideReason? }` → `AidView` |
| POST | `/v1/tontines/:id/aids/:aid/payout` | Trésorier / adjoint | `{ channel, reference?, justification? }` → `MovementView` |
| GET | `/v1/tontines/:id/debts` | membre (les siennes) / bureau (toutes) | → `DebtView[]` |
| POST | `/v1/tontines/:id/debts/:did/write-off` | Président / VP (≠ débiteur) | `{ reason }` → `DebtView` |

## Décisions votées et sanctions (ADR-0038)

| GET | `/v1/tontines/:id/decisions` | membre | → `DecisionView[]` (vote secret : `result` publié au dépouillement) |
| POST | `/v1/tontines/:id/decisions` | selon la décision : pause → bureau (calendrier) ; destitution → tout membre ; exclusion → Président / VP ; suspension → Censeur / Président / VP ; reprise de place → bureau | `{ kind, reason, targetMembershipId?, targetRole?, hours?, occurrences?, fromSeq?, incomingMembershipId? }` → `DecisionView` (201) |
| POST | `/v1/tontines/:id/decisions/:did/ballots` | électeur (membre actif, ≠ personne visée) | `{ choice: "yes" \| "no" \| "abstain" }` → `DecisionView` (201 ; exécute la décision si la majorité absolue est acquise) |
| POST | `/v1/tontines/:id/decisions/:did/close` | membre | → `DecisionView` (dépouillement : échéance passée ou issue certaine) |
| POST | `/v1/tontines/:id/decisions/:did/cancel` | auteur du vote / Président / VP | `{ reason }` → `DecisionView` |
| POST | `/v1/tontines/:id/decisions/:did/lift` | Président / VP (≠ personne visée) | `{ reason }` → `DecisionView` (levée d'une suspension) |
| GET | `/v1/tontines/:id/sanctions` | bureau (tous) / membre (soi) | → `SanctionView[]` (graduation suggérée : avertissement, amende, suspension, vote d'exclusion) |

## Reprise de l'historique (L-20)

| GET | `/v1/tontines/:id/history` | membre (sa ligne) / bureau (tout) | → `HistorySummary` (lignes importées, hors de tout total courant) |
| POST | `/v1/tontines/:id/history-imports` | Président / VP | `{ source: "cahier" \| "kombe_v1", label?, rows?: [{ memberName, date, amount }], njangi? }` → `HistoryImportResult` (201 ; réimport sans doublon) |

## Repères des membres (ADR-0039)

| POST | `/v1/cycle-simulations` | session | `{ cadence, firstMeetingDate, shares, contributionPerShare, sidePerMeeting? }` → `{ meetings, firstMeeting, lastMeeting, spanDays, pot, totalPerShare, dates, summary }` |
| GET | `/v1/tontines/:id/my-forecast` | membre | → `{ cycle, totalDue, totalToReceive, confirmedSoFar, turns[] }` (« mon tour » : qui avance à qui) |
| GET | `/v1/tontines/:id/regularity` | membre (selon la transparence) / bureau (tous) | → lignes `{ name, dueSoFar, onTime, late, unpaidLate, openFines, onTimeRate, badge }` |
| GET | `/v1/tontines/:id/meetings/:mid/share-text` | membre | → `{ text }` (résumé à coller dans WhatsApp, sans numéro) |

## Registre

| GET | `/v1/tontines/:id/journal` | membre | → `{ valid: boolean, entries: JournalEntryView[] }` (chaîne d'empreintes vérifiée) |

## Comportements à connaître (implémentation vérifiée sur PostgreSQL)

- **Erreurs** : `{ code, message }` ; sur ces routes `message` est un motif métier en français, affichable tel quel. 401 session, 403 droit, 404 hors portée (jamais « ce groupe existe »), 409 conflit d'état, 422 saisie, 429 trop d'essais.
- **Idempotence** : toute écriture accepte `Idempotency-Key` (8 à 120 caractères). Même clé + même corps ⇒ réponse rejouée (`idempotent-replay: true`) ; même clé + autre corps ⇒ 409.
- **Régler une dette** : `POST movements` avec `relatedKind: "debt"`, `relatedId` ; le serveur choisit la caisse et le type (avance ⇒ remboursement au fonds de caisse ; impayé ⇒ cotisation de rotation du tour concerné).
- **Payer une amende** : `kind: "fine_payment"` sur la caisse `fines`, `relatedKind: "fine"` ; le montant est celui de l'amende.
- **Confirmation** : la trésorerie confirme, jamais sa propre déclaration ni son propre versement ; les versements du trésorier sont confirmés par la présidence. Si un commissaire aux comptes est en fonction, la confirmation donne « confirmé » puis le commissaire valide ; sinon la confirmation valide directement.
- **Remise** : déclarée par la trésorerie (jamais par le bénéficiaire), devant témoins présents si la séance est ouverte ; le bénéficiaire (ou son mandataire) confirme la réception ; le tour ne se clôt qu'après cette confirmation. Une avance du fonds de caisse est tracée en sortie du fonds de caisse ET en entrée de la cagnotte.
- **Échéances** : la part d'un tour transformée en dette (remise réduite, avance, clôture) quitte les échéances et apparaît dans les dettes.
- **Décisions** : majorité ABSOLUE des électeurs (membres actifs ayant un téléphone, admis avant l'ouverture, personne visée exclue), jamais des seuls votants. Destitution et exclusion : 72 h minimum, pas d'adoption avant l'échéance sauf si tous ont voté. Bulletin unique et définitif ; le journal garde le dépôt, jamais le choix. Exécution dans la même transaction que le bulletin décisif : pause ⇒ tours et séances décalés sur la cadence ; destitution ⇒ fonction terminée ; exclusion ⇒ adhésion révoquée, dette de rattrapage si le membre a déjà bouffé (parrain avaliseur), sinon place vacante (remise bloquée jusqu'à la reprise) ; suspension ⇒ remise refusée (`PAYOUT_SUSPENDED`) jusqu'à la levée ; reprise de place ⇒ la part change de titulaire à partir du premier tour ouvert.
- **Diaspora** : canal `international_transfer` (Western Union, WorldRemit, Wave, Taptap Send…) ; le montant déclaré est celui REÇU en FCFA ; référence du transfert ou motif obligatoire.
- **Part partagée** : `POST members/:mid/shares` accepte `sharedWith` (membre) : deux membres tiennent UNE part, chacun cotise la moitié ; `sharedWith: null` défait le partage. Avant le démarrage seulement.
- **Recette** : `packages/api/test/tontineApi.proof.mjs` déroule tout ce contrat sur une vraie base (44 vérifications) ; `packages/api/test/decisions.proof.mjs` les décisions votées, la reprise du cahier et le transfert depuis l'étranger (55 vérifications : votes, reprise du cahier, transfert depuis l'étranger, tour prioritaire, échange).
