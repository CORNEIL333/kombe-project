# API de la tontine réelle — référence pour les clients (PWA, mobile)

Cette page décrit l'API « tontine réelle » de KÓMBE (lots L-01 à L-21) telle
qu'elle est implémentée dans `packages/api/src/tontine/`. Elle s'adresse aux
développeurs de la PWA et des applications mobiles.

- Contrat machine : `docs/openapi.yaml` (tags `tontine-*`). Un test
  (`packages/api/test/contract.test.ts`) vérifie que chaque route de
  `routes.ts` y figure.
- Parcours complet exécutable : `packages/api/test/tontineRealMode.proof.mjs`
  (de la connexion par téléphone à l'approbation du procès-verbal). Les
  exemples ci-dessous en sont tirés.

> **KÓMBE tient le registre ; il ne garde pas l'argent.** Chaque montant
> documente un paiement fait **hors de KÓMBE** (espèces, Orange Money, MTN MoMo,
> banque). Un « mouvement » est **déclaré** par une personne, **confirmé** par
> une autre (le trésorier, ou le bénéficiaire pour une remise), puis **validé**
> (par le commissaire aux comptes quand la caisse exige le contrôle). Dans
> l'interface, n'employez jamais de vocabulaire bancaire : on parle de
> cotisation, remise, caisse, écart du registre.

## Sommaire

1. [Généralités](#1-généralités)
2. [Authentification](#2-authentification)
3. [Erreurs](#3-erreurs)
4. [Fonctions du bureau et matrice des droits](#4-fonctions-du-bureau-et-matrice-des-droits)
5. [Circuit de validation des mouvements](#5-circuit-de-validation-des-mouvements)
6. [Routes](#6-routes)
   - [Produit et identité](#61-produit-et-identité)
   - [Groupe](#62-groupe)
   - [Invitations et adhésions](#63-invitations-et-adhésions)
   - [Bureau](#64-bureau)
   - [Calendrier, tirage, échanges de tours](#65-calendrier-tirage-échanges-de-tours)
   - [Séances](#66-séances)
   - [Caisses et mouvements](#67-caisses-et-mouvements)
   - [Amendes](#68-amendes)
   - [Secours](#69-secours)
   - [Dettes](#610-dettes)
   - [Statuts](#611-statuts)
   - [Historique](#612-historique)
   - [Notifications](#613-notifications)
7. [Énumérations](#7-énumérations)

---

## 1. Généralités

| Sujet | Règle |
|---|---|
| Préfixe | Toutes les routes commencent par `/v1`. |
| Mode | Ces routes n'existent qu'en **mode réel** (serveur démarré avec PostgreSQL). En mode fictif elles répondent 404. |
| Format | JSON (`Content-Type: application/json`). |
| Groupe | Le groupe est **toujours dans le chemin** (`/v1/groups/{groupId}/…`). L'acteur et ses fonctions sont résolus côté serveur depuis la session ; le client ne les envoie jamais. |
| Montants en entrée | Entier XAF, en nombre (`10000`) ou en chaîne de chiffres (`"10000"`), 1 à 1 000 000 000. Jamais de décimales. Certains champs de barème acceptent `0`. |
| Montants en sortie | **Chaînes décimales** (`"50000"`). Convertissez avec `BigInt` ou un entier, jamais en flottant. |
| Dates | Dates métier `AAAA-MM-JJ` (fuseau Africa/Douala). Horodatages en ISO 8601. |
| Jour de semaine | `0` = dimanche … `6` = samedi. |
| Casse des réponses | La plupart des réponses sont en camelCase ; certaines listes renvoient les colonnes en **snake_case** (signalé route par route). |
| Idempotence | Seul `POST /movements` accepte un en-tête `Idempotency-Key` (facultatif, 8 à 64 caractères `[A-Za-z0-9_-]`). |
| Limites de requêtes | 120 requêtes/minute par IP au total ; 10/minute sur `POST /v1/access/*`. Au-delà : `429 RATE_LIMITED` avec `retry-after: 60`. |
| Non-divulgation | Un groupe inexistant et un groupe dont vous n'êtes pas membre actif répondent pareil : `403 TONTINE_FORBIDDEN`. |
| Journal | Chaque décision est scellée dans le journal chaîné du groupe (`GET /v1/groups/{groupId}/journal/verify`). |

## 2. Authentification

Toutes les routes (sauf `GET /v1/product`) exigent l'en-tête :

```
Authorization: Bearer <sessionId>
```

Le `sessionId` est un identifiant opaque généré par le serveur. Sans session
valide : `401 SESSION_INVALID`.

### Identifiant : téléphone ou e-mail

Au Cameroun, le numéro de téléphone est l'identité de référence. Le serveur
**normalise tout numéro en E.164** avant usage :

| Saisie | Identité retenue |
|---|---|
| `6 90 00 00 01` | `+237690000001` |
| `690000001` | `+237690000001` |
| `00237 690 00 00 01` | `+237690000001` |
| `+237 677 00 00 03` | `+237677000003` |
| `237690000001` | `+237690000001` |
| `+33612345678` (diaspora) | `+33612345678` |

Un numéro camerounais doit avoir 9 chiffres commençant par 6 ou 2, sinon
`422 PHONE_INVALID`. Toute saisie composée de chiffres, espaces, `+`, `.`,
`-` ou parenthèses est traitée comme un numéro ; le reste est un e-mail.
Le code de vérification part **par SMS** pour un numéro, par e-mail sinon.
Si aucun fournisseur SMS n'est configuré côté serveur, l'envoi est refusé
explicitement : `502 SMS_DELIVERY_FAILED` (jamais un faux succès).

Le SMS envoyé ne contient ni nom de groupe ni montant :
`KÓMBE : votre code est 123456. Ne le partagez avec personne.`

### Parcours

1. **Inscription** (une fois) — `POST /v1/access/registrations`
   ```json
   { "identityId": "6 90 00 00 01", "channel": "phone" }
   ```
   → `202 { "accepted": true }` (réponse identique que le compte existe ou non).
   Pour un numéro, envoyez `"channel": "phone"` ; pour un e-mail, `"email"`.
2. **Vérification** — `POST /v1/access/registrations/verifications`
   ```json
   { "identityId": "6 90 00 00 01", "code": "123456" }
   ```
   → `200 { "state": "active" }`.
3. **Demande de connexion** (à chaque connexion) — `POST /v1/access/login-requests`
   ```json
   { "identityId": "+237690000001" }
   ```
   → `202 { "accepted": true }` ; un code part si le compte est actif.
4. **Connexion** — `POST /v1/access/login-completions`
   ```json
   { "identityId": "+237690000001", "code": "654321" }
   ```
   → `201 { "sessionId": "…", "expiresAt": 1792000000000 }`.

Conservez le `sessionId` de façon sûre (stockage sécurisé du mobile) et
présentez-le en `Bearer`. Récupération de compte :
`POST /v1/access/recovery-requests` puis `/v1/access/recovery-completions`
(révoque toutes les sessions antérieures).

## 3. Erreurs

Toute erreur a la forme :

```json
{ "code": "TONTINE_FORBIDDEN", "message": "Requête refusée" }
```

Le `message` est volontairement générique : **affichez un texte selon le
`code`**, jamais le message brut.

### Codes génériques

| Code | HTTP | Sens |
|---|---|---|
| `VALIDATION` | 422 | Corps, chemin ou requête non conforme au schéma (champ manquant, type, longueur…). |
| `INVALID_REQUEST` | 4xx | Requête HTTP malformée (JSON illisible, type de contenu refusé). |
| `SESSION_INVALID` | 401 | Session absente, expirée ou révoquée : reconnecter. |
| `RATE_LIMITED` | 429 | Trop de requêtes ; réessayer après 60 s. |
| `INTERNAL` | 500 | Erreur serveur. |

### Codes de la tontine réelle (`STATUS_BY_CODE`, `packages/api/src/server.ts`)

| Code | HTTP | Quand |
|---|---|---|
| `TONTINE_FORBIDDEN` | 403 | Pas membre actif du groupe, ou votre fonction ne permet pas cet acte. |
| `OBJET_INTROUVABLE` | 404 | Objet absent du groupe (membre, séance, caisse, mouvement, amende, dette…). |
| `PHONE_INVALID` | 422 | Numéro de téléphone invalide. |
| `SMS_DELIVERY_FAILED` | 502 | SMS non envoyé (fournisseur absent ou en échec). |
| `GROUP_NAME_INVALID` | 422 | Nom de groupe (2–120) ou nom affiché (1–80) invalide. |
| `CADENCE_INVALID` | 422 | Rythme de séances, date ou heure limite invalide. |
| `MEETING_STATE_INVALID` | 409 | Transition de séance impossible (ex. collecte hors séance ouverte), PV non approuvable ou empreinte de PV différente. |
| `ATTENDANCE_INVALID` | 422 | Statut de présence incohérent (représenté sans représentant, ou l'inverse). |
| `WITNESS_REQUIRED` | 422 | Témoins de remise insuffisants, absents, en double, ou confondus avec le bénéficiaire ou le trésorier ; ou `minimumWitnesses` hors 1–5. |
| `FUND_INVALID` | 422 | Caisse, canal ou référence invalide ; sortie supérieure à l'écart du registre ; frais supérieurs au montant. |
| `FUND_KIND_DISABLED` | 403 | Caisse `loan` ou `collector` encore fermée par drapeau. |
| `MOVEMENT_STATE_INVALID` | 409 | Confirmation, contrôle ou rejet sur un mouvement qui n'est pas dans le bon état. |
| `MOVEMENT_NOT_INDEPENDENT` | 403 | Le déclarant confirme, contrôle ou rejette sa propre opération ; ou le contrôleur est aussi le confirmateur. |
| `FINE_INVALID` | 422 | Amende invalide (sans motif, à soi-même, au-dessus du plafond, montant nul au barème, transition impossible). |
| `AID_INVALID` | 422 | Secours invalide (événement non couvert, non approuvé, motif d'exception manquant). |
| `AID_CAP_EXCEEDED` | 409 | Plafond annuel atteint, ou montant d'exception au-delà du double du barème. |
| `DEBT_INVALID` | 422 | Dette invalide ; **aussi** : avaliseur manquant ou inactif à la demande d'adhésion. |
| `ORDER_CHANGE_INVALID` | 422 | Échange de tours impossible (tour déjà remis, même titulaire, demandeur non titulaire). |
| `DRAW_INVALID` | 422 | Tirage invalide (empreinte, graine différente, déjà révélé, non révélé). |
| `SHARES_INVALID` | 422 | Parts invalides (moins de 2, titulaire non actif ou en double, poids hors 1–100, membre sans part). |
| `MANDATE_INVALID` | 422 | Fonction inconnue, déjà occupée ou déjà proposée, dates de mandat invalides, président sans intérim. |
| `IMPORT_INVALID` | 422 | Reprise d'historique invalide ou déjà faite. |

### Autres codes rencontrés sur ces routes

| Code | HTTP | Quand |
|---|---|---|
| `APPROVER_NOT_DISTINCT` | 403 | On ne s'admet pas, on ne s'attribue pas une fonction financière, on n'approuve pas un échange qui nous concerne, on ne décide pas de sa propre aide, d'une amende ou d'une dette qui nous visent. |
| `INVITATION_INVALID` | 410 | Code inconnu, expiré, révoqué ou épuisé ; ou paramètres d'invitation hors bornes. |
| `MEMBERSHIP_ALREADY_ACTIVE` | 409 | Déjà membre ou demande déjà en cours. |
| `ROLE_ACCEPTANCE_REQUIRED` | 409 | Fonction déjà acceptée ou close. |
| `CYCLE_START_NOT_READY` | 409 | Effectif minimal non atteint ; pas de président et trésorier distincts acceptés ; calendrier incomplet. |
| `SCHEDULE_FROZEN` | 409 | Cycle déjà démarré : calendrier figé. |
| `SCHEDULE_ROUNDS_MISMATCH` | 422 | L'ordre manuel ne cite pas chaque membre actif une fois. |
| `RULE_INVALID` | 422 | Bornes d'effectif invalides, effectif maximal atteint, cotisation nulle. |
| `GROUP_STATE_INVALID` | 422 | Transparence inconnue. |
| `CONTRIBUTION_EXCEEDS_REMAINING` | 409 | Cotisation supérieure au restant dû de l'échéance. |
| `REFERENCE_JUSTIFICATION_REQUIRED` | 422 | Canal électronique sans référence ni motif. |
| `IDEMPOTENCY_BODY_CONFLICT` | 409 | `Idempotency-Key` rejouée avec un autre montant. |
| `DISBURSEMENT_STATE_INVALID` | 409 | Le tour a déjà sa remise. |
| `RULE_ACCEPT_HASH_MISMATCH` | 412 | Statuts acceptés sur une empreinte périmée : relire la dernière version. |
| `MONEY_*` | 422 | Montant non entier, négatif ou hors plafond. |

## 4. Fonctions du bureau et matrice des droits

Un membre peut **cumuler plusieurs fonctions** ; l'acteur porte toutes ses
fonctions acceptées et non terminées. Une fonction proposée ne compte
qu'après **acceptation par la personne nommée**.

| Identifiant technique | Libellé affiché |
|---|---|
| `animator` | Président |
| `vice_president` | Vice-président |
| `secretary` | Secrétaire général |
| `treasurer` | Trésorier |
| `treasurer_deputy` | Trésorier adjoint |
| `auditor` | Commissaire aux comptes |
| `censor` | Censeur |
| `advisor` | Conseiller |
| `member` | Membre |

Matrice `MATRIX` (`packages/domain/src/tontine/roles.ts`). P = Président,
VP = Vice-président, SG = Secrétaire général, T = Trésorier,
TA = Trésorier adjoint, CC = Commissaire aux comptes, Ce = Censeur,
Co = Conseiller, M = Membre.

| Action | P | VP | SG | T | TA | CC | Ce | Co | M |
|---|---|---|---|---|---|---|---|---|---|
| `group.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `group.manage` (règlement) | ✓ | ✓ | ✓ | | | | | | |
| `member.invite` | ✓ | ✓ | ✓ | | | | | | |
| `member.admit` (admission, arbitrage des amendes) | ✓ | ✓ | | | | | | | |
| `member.remove` (pas encore de route) | ✓ | ✓ | | | | | | | |
| `role.assign` | ✓ | ✓ | | | | | | | |
| `rules.publish` (pas encore de route) | ✓ | ✓ | ✓ | | | | | | |
| `schedule.manage` | ✓ | ✓ | ✓ | | | | | | |
| `meeting.manage` | ✓ | ✓ | ✓ | | | | | | |
| `meeting.attendance` | ✓ | ✓ | ✓ | | | | ✓ | | |
| `movement.declare` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `movement.confirm` | | | | ✓ | ✓ | | | | |
| `movement.control` | | | | | | ✓ | | | |
| `fine.issue` | ✓ | ✓ | | | | | ✓ | | |
| `aid.request` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `aid.decide` | ✓ | ✓ | ✓ | ✓ | | | | | |
| `fund.manage` | ✓ | ✓ | | ✓ | | | | | |
| `debt.manage` | ✓ | ✓ | | ✓ | | | | | |
| `order.manage` (tirage, approbation d'échange) | ✓ | ✓ | ✓ | | | | | | |
| `order.swap.request` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `statutes.publish` | ✓ | ✓ | ✓ | | | | | | |
| `import.history` | ✓ | ✓ | | | | | | | |

La matrice dit **qui peut tenter** l'acte. L'**indépendance** se vérifie en
plus, opération par opération : le déclarant ne confirme jamais sa propre
opération, le contrôleur est distinct du déclarant et du confirmateur, etc.
Quelques routes vérifient directement une fonction plutôt qu'une action de la
matrice (remise en séance et versement d'un secours : Trésorier ou Trésorier
adjoint) ; c'est indiqué route par route.

## 5. Circuit de validation des mouvements

```
déclaré ──(confirmation)──▶ confirmé ──(contrôle)──▶ validé
   │        trésorier,          │      commissaire
   │        ou bénéficiaire     │      aux comptes
   │        pour une remise     │
   └──────────(rejet)───────────┴──▶ rejeté
```

| État (`state`) | Libellé | Qui agit ensuite |
|---|---|---|
| `declared` | Déclaré | Trésorier ou trésorier adjoint (distinct du déclarant) ; pour une remise (`payout`), **le bénéficiaire lui-même**. |
| `confirmed` | Confirmé | Commissaire aux comptes, distinct du déclarant et du confirmateur. N'existe que si la caisse exige le contrôle. |
| `validated` | Validé | Plus rien : le mouvement compte dans l'écart du registre. |
| `rejected` | Rejeté | Fin ; motif dans `rejectedReason`. |

- Si la caisse a `controlRequired = false` (par défaut : caisse des amendes,
  fonds de caisse), la **confirmation vaut validation** : l'état passe
  directement à `validated`.
- Caisses avec contrôle par défaut : rotation, secours, réserve de fin d'année.
- **Effets à la validation** : la cotisation est créditée sur l'échéance
  (`validated`), l'amende passe à `paid`, le secours à `paid`, la dette est
  réglée en tout ou partie.
- **Écart du registre** (`registerBalance` d'une caisse) : somme signée des
  mouvements validés. Les montants déclarés ou confirmés sont montrés à part
  (`inProgressIn`, `inProgressOut`).

La file « à valider » de l'utilisateur courant est
`GET /v1/groups/{groupId}/pending-validations`.

---

## 6. Routes

Notation : **Qui** = condition d'accès en plus de la session. « Membre actif »
signifie toute adhésion active du groupe (`group.read`). Les codes d'erreur
les plus probables sont listés ; `401 SESSION_INVALID` et
`403 TONTINE_FORBIDDEN` (non-membre) valent partout.

### 6.1 Produit et identité

#### `GET /v1/product`
Positionnement et drapeaux ouverts. **Qui** : public (sans session).

```json
{
  "positioning": {
    "fr": "KÓMBE tient le registre de votre tontine et de votre association. Il ne garde pas votre argent.",
    "en": "KÓMBE keeps the record of your tontine and your association. It does not hold your money."
  },
  "featureFlags": []
}
```
`featureFlags` ⊂ `loan_register`, `auction`, `daily_collector`.

#### `GET /v1/me/groups`
Mes adhésions. **Qui** : toute session.

```json
[{ "groupId": "grp_…", "membershipId": "mem_…", "membershipState": "active",
   "name": "Njangi des Bamenda de Bonabéri", "groupState": "active",
   "roles": ["animator", "member"] }]
```

#### `GET /v1/me/profile` · `PUT /v1/me/profile`
**Qui** : toute session. Corps du `PUT` (les deux champs sont requis) :

```json
{ "displayName": "Mama Ngono", "language": "fr" }
```
`language` ∈ `fr`, `en`, `pcm`. Réponse (les deux routes) :
`{ "identityId": "+237690000001", "displayName": "Mama Ngono", "language": "fr" }`.

### 6.2 Groupe

#### `POST /v1/tontine/groups` — créer un groupe
**Qui** : toute session. Le créateur devient **Président** (accepté d'office)
et membre actif. Groupe créé en état `configuration`.

| Champ | Type | Requis | Règle |
|---|---|---|---|
| `name` | texte | oui | 2–120 caractères |
| `displayName` | texte | oui | nom du créateur dans ce groupe, 1–80 |
| `funds` | liste de `FundKind` | non | défaut : `rotation`, `solidarity`, `fines`, `operating`, `year_end_reserve` ; `rotation` toujours ajoutée ; `loan`/`collector` refusées (`403 FUND_KIND_DISABLED`) |
| `settings` | objet | non | même forme que `PATCH /settings` |

```http
POST /v1/tontine/groups
{ "name": "Njangi des Bamenda de Bonabéri", "displayName": "Mama Ngono" }
```
→ `201 { "groupId": "grp_…", "membershipId": "mem_…" }`

#### `GET /v1/groups/{groupId}/overview`
**Qui** : membre actif. Une adhésion encore `pending` reçoit 403.

```json
{
  "groupId": "grp_…", "name": "…", "state": "active",
  "settings": { "transparency": "all_members", "feeBearer": "beneficiary", "…": "…" },
  "me": { "membershipId": "mem_…", "roles": ["treasurer", "member"], "displayName": "Tata Esther" },
  "members": { "active": 5, "pending": 0 },
  "schedule": { "state": "started", "cadence": { "kind": "monthly_nth_weekday", "nth": 2, "weekday": 6 },
                "cadenceLabel": "le 2e samedi du mois" },
  "nextMeeting": { "meeting_id": "grp_…_m2", "seq": 2, "scheduled_date": "…", "state": "planned", "location": "…" },
  "pendingValidations": 3
}
```
`nextMeeting` est en snake_case.

#### `GET /v1/groups/{groupId}/members`
**Qui** : membre actif. Les adhésions `pending` et le `contact` ne sont
visibles que de P, VP, SG (fonctions qui invitent ou admettent). Le contact
d'un numéro est masqué : `+237 6•• •• •• 03`. En transparence `anonymized`,
un simple membre voit « Membre » au lieu des autres noms.

```json
[{ "membershipId": "mem_…", "displayName": "Papa Fon", "state": "active",
   "roles": ["auditor", "member"], "joinedAt": "2026-10-13T…Z",
   "sponsorMembershipId": null, "proxyMembershipId": null, "isMe": false,
   "contact": "+237 6•• •• •• 03" }]
```

#### `PATCH /v1/groups/{groupId}/settings` — règlement
**Qui** : `group.manage` (P, VP, SG). Toutes les clés sont facultatives.

| Clé | Valeurs |
|---|---|
| `transparency` | `all_members` (tout le monde voit tout), `bureau_only` (un membre ne voit que ses mouvements), `anonymized` (noms masqués) |
| `feeBearer` | qui supporte les frais Mobile Money d'une remise : `member`, `beneficiary` (défaut), `fund` |
| `guarantorRequired` | avaliseur exigé à l'adhésion (défaut `false`) |
| `newcomersLast` | les derniers admis passent en dernier au tirage (défaut `true`) |
| `minMembers` / `maxMembers` | 2 ≤ min ≤ max ≤ 200 (défaut 2 / 60) |
| `fines` | barème : `lateContributionFixed`, `lateContributionPerDay`, `lateContributionCap`, `meetingLate`, `meetingAbsence`, `indisciplineCap` (montants ≥ 0), `graceDays` (0–60) — tous requis si `fines` est fourni |
| `aidScale` | barème des secours : `[{ "event", "amount", "maxPerYear" }]` (≤ 20 lignes, `maxPerYear` 0 = sans plafond) |
| `seat`, `purpose`, `meetingPlace` | textes (siège, objet, lieu habituel) |
| `minimumWitnesses` | témoins exigés à une remise, 1–5 (défaut 2) |

```json
{
  "fines": { "lateContributionFixed": 1000, "lateContributionPerDay": 100, "lateContributionCap": 3000,
             "meetingLate": 200, "meetingAbsence": 500, "indisciplineCap": 1000, "graceDays": 3 },
  "aidScale": [{ "event": "birth", "amount": 20000, "maxPerYear": 2 }],
  "meetingPlace": "Chez le président, Bonabéri"
}
```
→ `200` réglages complets, montants en chaînes (`"meetingAbsence": "500"`).

### 6.3 Invitations et adhésions

#### `POST /v1/groups/{groupId}/invitations` — émettre un code
**Qui** : `member.invite` (P, VP, SG). Corps facultatif :
`{ "maxUses": 1–200 (20), "ttlHours": 1–720 (168), "channel": "link" | "whatsapp" }`.

→ `201 { "invitationId": "inv_…", "code": "K7MPQ2XA", "expiresAt": "…" }`
(8 caractères sans 0/O/1/I). Bornes dépassées : `410 INVITATION_INVALID`.

#### `GET /v1/groups/{groupId}/invitations`
**Qui** : `member.invite`. 50 derniers codes, **snake_case** :
`invitation_id`, `code`, `channel`, `max_uses`, `used_count`, `expires_at`, `revoked_at`.

#### `POST /v1/groups/{groupId}/invitations/{invitationId}/revocations`
**Qui** : `member.invite`. → `204`. Inconnue ou déjà révoquée : `404 OBJET_INTROUVABLE`.

#### `GET /v1/invitations/by-code/{code}`
**Qui** : toute session (on n'est pas encore membre). Code insensible à la casse.
→ `200 { "groupId": "grp_…", "groupName": "…", "usable": true }`.
Code inconnu : `410 INVITATION_INVALID`.

#### `POST /v1/invitations/by-code/{code}/requests` — demander à rejoindre
**Qui** : toute session.
```json
{ "displayName": "Brice", "sponsorMembershipId": null }
```
→ `201 { "membershipId": "mem_…", "state": "pending", "groupId": "grp_…" }`.
La présidence est notifiée. Erreurs : `410 INVITATION_INVALID` (code inutilisable),
`409 MEMBERSHIP_ALREADY_ACTIVE`, `422 DEBT_INVALID` (avaliseur exigé absent ou inactif).

#### `POST /v1/groups/{groupId}/memberships/{membershipId}/decisions`
**Qui** : `member.admit` (P, VP), jamais pour soi (`403 APPROVER_NOT_DISTINCT`).
```json
{ "decision": "admit" }
```
→ `200 { "state": "active" }` (ou `"revoked"` pour `refuse`). Effectif
maximal atteint : `422 RULE_INVALID`. Le demandeur est notifié.

### 6.4 Bureau

#### `GET /v1/groups/{groupId}/roles`
**Qui** : membre actif. Fonctions non terminées (hors « membre »),
**snake_case** : `role_assignment_id`, `membership_id`, `display_name`,
`role`, `accepted_at` (nul = en attente d'acceptation), `mandate_start`,
`mandate_end`, `proposed`.

#### `POST /v1/groups/{groupId}/roles` — proposer une fonction
**Qui** : `role.assign` (P, VP).
```json
{ "membershipId": "mem_…", "role": "treasurer", "mandateStart": "2026-10-13", "mandateEnd": "2027-10-13" }
```
→ `201 { "roleAssignmentId": "ra_…" }`. La personne nommée est notifiée.

Règles : `role` ≠ `member` ; une fonction financière (T, TA, CC) ne
s'attribue pas à soi-même (`403 APPROVER_NOT_DISTINCT`) ; Président et
Trésorier : une seule personne à la fois (`422 MANDATE_INVALID` tant que le
mandat en cours n'est pas terminé) ; fin strictement après le début, 5 ans
au plus, `mandateEnd` `null` = sans terme.

#### `POST /v1/groups/{groupId}/roles/{roleAssignmentId}/acceptances`
**Qui** : la personne nommée uniquement. → `204`. Déjà acceptée ou close :
`409 ROLE_ACCEPTANCE_REQUIRED`.

#### `POST /v1/groups/{groupId}/roles/{roleAssignmentId}/end`
**Qui** : le titulaire (démission) ou `role.assign`. Corps facultatif
`{ "reason": "…" }`. → `204`. Le Président ne part que si un Vice-président
accepté assure l'intérim (`422 MANDATE_INVALID`).

### 6.5 Calendrier, tirage, échanges de tours

#### `PUT /v1/groups/{groupId}/tontine-schedule` — construire le calendrier
**Qui** : `schedule.manage` (P, VP, SG). Reconstructible tant que le cycle
n'a pas démarré (`409 SCHEDULE_FROZEN` ensuite).

| Champ | Règle |
|---|---|
| `cadence` | voir [Cadence](#cadence) |
| `startDate` | `AAAA-MM-JJ`, première occurrence à partir de cette date |
| `contributionPerShare` | cotisation par part et par tour |
| `dueTime` | heure limite `HH:MM` (Douala), défaut `18:00` |
| `order` | `{ "mode": "join_order" }`, `{ "mode": "manual", "membershipIds": [...] }` (chaque membre actif une fois) ou `{ "mode": "draw", "drawId": "…" }` (tirage révélé) |
| `shares` | facultatif : parts explicites `[{ "holders": [{ "membershipId", "weight" }] }]`, 1 à 4 titulaires par part, poids 1–100 ; une part = un tour ; chaque membre actif détient au moins une part |

```json
{
  "cadence": { "kind": "monthly_nth_weekday", "nth": 2, "weekday": 6 },
  "startDate": "2026-11-01",
  "contributionPerShare": 10000,
  "order": { "mode": "manual", "membershipIds": ["mem_brice", "mem_clarisse", "mem_fon", "mem_ngono", "mem_esther"] }
}
```
→ `200` calendrier (même forme que le `GET`) :
```json
{
  "state": "draft", "cadence": { "…": "…" }, "cadenceLabel": "le 2e samedi du mois",
  "rulesVersion": 1, "contributionPerShare": "10000", "potPerRound": "50000", "startedAt": null,
  "rounds": [
    { "seq": 1, "roundId": "grp_…_r1", "state": "open", "date": "2026-11-14", "shareId": "grp_…_s1",
      "holders": [{ "membershipId": "mem_brice", "name": "Brice", "weight": 1 }], "meetingId": null }
  ]
}
```
Erreurs : `409 CYCLE_START_NOT_READY` (effectif minimal), `422 SCHEDULE_ROUNDS_MISMATCH`,
`422 SHARES_INVALID`, `422 CADENCE_INVALID`, `422 DRAW_INVALID` (tirage non révélé).

#### `GET /v1/groups/{groupId}/tontine-schedule`
**Qui** : membre actif. Sans calendrier : `{ "state": "none", "rounds": [] }`.

#### `POST /v1/groups/{groupId}/tontine-schedule/start` — démarrer le cycle
**Qui** : `schedule.manage`. Exige un Président et un Trésorier **acceptés et
distincts** et au moins 2 tours (`409 CYCLE_START_NOT_READY`). Crée une
séance par tour (`meetingId` renseigné), fige le calendrier, passe le groupe
en `active` et notifie tous les membres. → `200` calendrier `started`.

#### `POST /v1/groups/{groupId}/draws` — engager un tirage
**Qui** : `order.manage` (P, VP, SG). L'empreinte est publiée **avant** la graine :
`commitment = sha256("kombe-draw:" + graine)` en hexadécimal.
```js
const seed = "graine-publique-du-13-octobre-2026"; // ≥ 16 caractères
const commitment = sha256Hex(`kombe-draw:${seed}`);
```
`{ "commitment": "<64 hex>" }` → `201 { "drawId": "draw_…" }`.

#### `POST /v1/groups/{groupId}/draws/{drawId}/reveal`
**Qui** : `order.manage`. `{ "seed": "graine-publique-du-13-octobre-2026" }`
→ `200 { "order": ["mem_…", "…"] }`. Graine différente : `422 DRAW_INVALID`.
L'ordre ne dépend que de la graine et des membres actifs : tout membre peut
le rejouer. Utilisez ensuite `order: { "mode": "draw", "drawId": "…" }`.

#### `POST /v1/groups/{groupId}/order-changes` — demander un échange
**Qui** : un titulaire de l'un des deux tours (`order.swap.request`).
```json
{ "seqA": 2, "seqB": 3, "reason": "Rentrée scolaire" }
```
→ `201 { "changeId": "chg_…" }`. Tour déjà remis, même titulaire, ou
demandeur non titulaire : `422 ORDER_CHANGE_INVALID`.

#### `POST /v1/groups/{groupId}/order-changes/{changeId}/{act}`
`act` ∈ `accept`, `approve`, `reject`. Pas de corps. → `200 { "state": … }`.

| `act` | Qui |
|---|---|
| `accept` | chaque titulaire concerné |
| `approve` | `order.manage`, personne non concernée par l'échange (`403 APPROVER_NOT_DISTINCT`) |
| `reject` | un titulaire concerné ou `order.manage` |

L'échange s'applique (`"applied"`) quand **tous** les titulaires ont accepté
**et** qu'un membre du bureau a approuvé ; sinon `"requested"`.

#### `GET /v1/groups/{groupId}/order-changes`
**Qui** : membre actif. 50 dernières demandes, **snake_case** : `change_id`,
`kind`, `seq_a`, `seq_b`, `reason`, `required_identity_ids`,
`accepted_identity_ids`, `approved`, `state`, `created_at`.

#### `GET /v1/groups/{groupId}/my-obligations` — mes échéances
**Qui** : membre actif, pour lui-même.
```json
[{ "obligationId": "grp_…_r1_mem_…", "roundSeq": 1, "dueDate": "2026-11-14",
   "due": "10000", "declared": "10000", "validated": "10000", "remaining": "0",
   "status": "settled", "meetingId": "grp_…_m1" }]
```
`remaining` = dû − déjà déclaré. `status` ∈ `settled`, `on_time`, `grace`
(dans le délai de grâce), `late`.

### 6.6 Séances

États : `planned` → `open` → `closed` ; `planned` → `cancelled`.

#### `GET /v1/groups/{groupId}/meetings`
**Qui** : membre actif. **snake_case** : `meeting_id`, `seq`,
`scheduled_date`, `state`, `location`, `host_membership_id`, `host_name`,
`round_seq`, `minutes_hash`, `minutes_approved_at`.

#### `GET /v1/groups/{groupId}/meetings/{meetingId}`
**Qui** : membre actif.
```json
{
  "meetingId": "grp_…_m1", "seq": 1, "scheduledDate": "2026-11-14", "state": "closed",
  "location": "…", "hostMembershipId": null, "notes": null,
  "minutesText": "PROCÈS-VERBAL — …", "minutesHash": "<64 hex>", "minutesApprovedAt": null,
  "attendance": [{ "membership_id": "mem_…", "display_name": "Brice", "status": "present", "represented_by_membership_id": null }],
  "round": { "round_id": "grp_…_r1", "seq": 1, "share_id": "grp_…_s1", "holders": [{ "membershipId": "mem_…", "name": "Brice", "weight": 1 }] },
  "pot": "50000",
  "dues": [{ "obligationId": "…", "membershipId": "mem_…", "name": "Brice", "due": "10000", "declared": "10000", "validated": "10000" }]
}
```
`attendance` et `round` sont en snake_case.

#### `PATCH /v1/groups/{groupId}/meetings/{meetingId}`
**Qui** : `meeting.manage` (P, VP, SG), séance `planned` ou `open`.
`{ "location", "hostMembershipId", "scheduledDate", "notes" }` (tous
facultatifs ; `null` laisse le champ inchangé). Changer `scheduledDate`
reporte aussi le tour. → `204`.

#### `POST /v1/groups/{groupId}/meetings/{meetingId}/open`
**Qui** : `meeting.manage`. → `200 { "state": "open" }`. L'appel est
pré-rempli « absent » pour chaque membre actif.

#### `POST /v1/groups/{groupId}/meetings/{meetingId}/cancel`
**Qui** : `meeting.manage`. `{ "reason": "Deuil dans la famille de l'hôte" }`
(3–300) → `200 { "state": "cancelled" }`.

#### `PUT /v1/groups/{groupId}/meetings/{meetingId}/attendance` — l'appel
**Qui** : `meeting.attendance` (P, VP, SG, Censeur), séance ouverte.
```json
{ "entries": [
  { "membershipId": "mem_ngono", "status": "present" },
  { "membershipId": "mem_fon", "status": "late" },
  { "membershipId": "mem_clarisse", "status": "represented", "representedByMembershipId": "mem_brice" }
] }
```
→ `200 { "present": 5, "absent": 0, "excused": 0 }` (`late` et
`represented` comptent présents).

#### `POST /v1/groups/{groupId}/meetings/{meetingId}/collections` — collecte en séance
**Qui** : séance ouverte ; saisir pour un autre membre exige
`movement.confirm` (T, TA) ou `meeting.attendance` (P, VP, SG, Ce).
Chaque ligne devient une cotisation **déclarée** (caisse de rotation par défaut).
```json
{ "items": [{ "membershipId": "mem_brice", "amount": 10000, "channel": "cash" }] }
```
→ `201 { "movementIds": ["mv_…"] }`. Le trésorier confirme ensuite (en lot :
`POST /movements/confirmations`).

#### `POST /v1/groups/{groupId}/meetings/{meetingId}/payouts` — remise devant témoins
**Qui** : Trésorier ou Trésorier adjoint, séance ouverte, une seule remise
non rejetée par tour (`409 DISBURSEMENT_STATE_INVALID`).

| Champ | Règle |
|---|---|
| `channel`, `reference`, `justification` | comme un mouvement |
| `witnessMembershipIds` | ≥ `minimumWitnesses`, **présents à l'appel**, distincts du bénéficiaire et du déclarant |
| `amount` | montant brut ; défaut : la cagnotte du tour (`potPerRound`) |
| `fee` | frais Mobile Money, imputés selon `feeBearer` (`beneficiary` : déduits ; `fund` : mouvement `fee` séparé ; `member` : ignorés) |

```json
{ "channel": "orange_money", "reference": "OM-2611-4471", "witnessMembershipIds": ["mem_fon", "mem_clarisse"] }
```
→ `201 { "movementIds": ["mv_…"] }` (une remise par titulaire de la part,
au prorata des poids, plus éventuellement les frais). **Le bénéficiaire
confirme lui-même la réception** (`POST /movements/{id}/confirmations`), puis
le commissaire valide.

#### `POST /v1/groups/{groupId}/meetings/{meetingId}/close` — clôture et PV
**Qui** : `meeting.manage`, séance ouverte. Corps facultatif :
```json
{ "decisions": ["Prochaine séance chez Tata Esther"], "notes": null, "autoFines": true }
```
→ `200 { "minutesHash": "<64 hex>", "finesIssued": 1 }`. Avec `autoFines`,
une amende d'absence ou de retard est émise selon le barème pour chaque
absent ou retardataire (sauf l'acteur). Le procès-verbal est généré depuis
les faits (appel, cotisations, remises, amendes, décisions) ; lisez-le dans
`GET /meetings/{id}` (`minutesText`). Tous les membres sont notifiés.

#### `POST /v1/groups/{groupId}/meetings/{meetingId}/minutes-approval`
**Qui** : `meeting.manage`, séance close, PV non encore approuvé.
`{ "hash": "<minutesHash présenté>", "inMeetingId": "grp_…_m2" }` → `204`.
Empreinte différente : `409 MEETING_STATE_INVALID` (le PV a changé).

### 6.7 Caisses et mouvements

#### `GET /v1/groups/{groupId}/funds`
**Qui** : membre actif.
```json
[{ "fundId": "fund_…", "kind": "rotation", "name": "Tontine (njangi)", "state": "active",
   "rules": { "perMeetingAmount": "0", "annualAmount": "0", "controlRequired": true, "allowNegative": false },
   "registerBalance": "0", "inProgressIn": "0", "inProgressOut": "0" }]
```
`registerBalance` est l'**écart du registre** (mouvements validés), jamais de
l'argent détenu par KÓMBE.

#### `POST /v1/groups/{groupId}/funds`
**Qui** : `fund.manage` (P, VP, T).
`{ "kind": "operating", "name": "Fonds de réception", "perMeetingAmount": 500, "annualAmount": 0, "controlRequired": false }`
→ `201 { "fundId": "fund_…" }`. `loan`/`collector` sans drapeau ouvert :
`403 FUND_KIND_DISABLED`.

#### `POST /v1/groups/{groupId}/movements` — déclarer un mouvement
**Qui** : tout membre actif pour **ses propres** versements (`contribution`,
`fine_payment`, `advance_repayment`). Déclarer pour un autre membre, ou une
sortie (`payout`, `advance`, `transfer_out`, `fee`, `expense`), exige
`movement.confirm` (T, TA) ou `meeting.attendance` (P, VP, SG, Ce).

| Champ | Requis | Règle |
|---|---|---|
| `fundId` | oui | caisse active du groupe |
| `kind` | oui | voir [MovementKind](#movementkind) |
| `amount` | oui | entier > 0 |
| `channel` | oui | `cash`, `orange_money`, `mtn_momo`, `bank`, `other` |
| `reference` | non | ≤ 64, lettres/chiffres/`. - _ /` ; hors espèces, sans référence il faut une `justification` |
| `justification` | selon canal | ≤ 500 |
| `allegedDate` | non | date du paiement, défaut aujourd'hui |
| `membershipId` | non | membre concerné ; soi-même par défaut pour un versement |
| `meetingId` | non | séance |
| `obligationId` | non | échéance visée par une cotisation de rotation (sinon déduite de `meetingId`) |
| `relatedKind`, `relatedId` | selon `kind` | `fine_payment` : `relatedId` = `fineId` ; `advance_repayment` : `relatedId` = `debtId` |
| `payerNote` | non | ≤ 120 |

En-tête facultatif `Idempotency-Key` : rejouée avec le même montant, elle
renvoie le mouvement d'origine ; avec un autre montant,
`409 IDEMPOTENCY_BODY_CONFLICT`. Recommandé pour toute saisie hors ligne.

```http
POST /v1/groups/grp_…/movements
Idempotency-Key: fine-pay-0001
{ "fundId": "fund_amendes", "kind": "fine_payment", "amount": 500, "channel": "mtn_momo",
  "reference": "MOMO-77812", "relatedId": "fine_…" }
```
→ `201 { "movementId": "mv_…", "state": "declared" }`. La trésorerie est notifiée.

Erreurs : `409 CONTRIBUTION_EXCEEDS_REMAINING` (au-delà du restant dû),
`404 OBJET_INTROUVABLE` (cotisation de rotation sans échéance),
`422 REFERENCE_JUSTIFICATION_REQUIRED`, `422 FUND_INVALID` (sortie supérieure
à l'écart du registre, référence illisible).

#### `GET /v1/groups/{groupId}/movements`
**Qui** : membre actif. Filtres de requête : `state`, `fundId`, `meetingId`,
`mine=true`. 200 derniers. En transparence `bureau_only`, un simple membre ne
voit que les siens ; en `anonymized`, le nom des autres est masqué.
```json
[{ "movementId": "mv_…", "fundId": "fund_…", "fundName": "Tontine (njangi)", "fundKind": "rotation",
   "kind": "contribution", "amount": "10000", "state": "confirmed", "channel": "cash",
   "reference": null, "allegedDate": "2026-11-14", "declaredAt": "…",
   "membershipId": "mem_…", "memberName": "Brice", "meetingId": "grp_…_m1",
   "relatedKind": null, "relatedId": "grp_…_r1_mem_…", "declaredByMe": false, "rejectedReason": null }]
```
`reference` n'est visible que du bureau et du déclarant.

#### `GET /v1/groups/{groupId}/pending-validations` — ma file « à valider »
**Qui** : membre actif. Même forme que la liste. T/TA : mouvements
`declared` (hors remises) ; bénéficiaire : ses remises `declared` ; CC :
mouvements `confirmed`. Jamais ceux que j'ai déclarés.

#### `POST /v1/groups/{groupId}/movements/{movementId}/confirmations`
**Qui** : `movement.confirm` (T, TA) ; pour une remise, **le bénéficiaire**
seulement (`403 TONTINE_FORBIDDEN` pour le trésorier). Jamais le déclarant
(`403 MOVEMENT_NOT_INDEPENDENT`). Pas de corps.
→ `200 { "state": "confirmed" }` (caisse avec contrôle) ou `{ "state": "validated" }`.

#### `POST /v1/groups/{groupId}/movements/confirmations` — en lot
**Qui** : comme ci-dessus, pour chaque mouvement.
`{ "movementIds": ["mv_1", "mv_2"] }` (1–100) →
`200 { "mv_1": "confirmed", "mv_2": "confirmed" }`. Tout ou rien : un refus
annule le lot.

#### `POST /v1/groups/{groupId}/movements/{movementId}/controls`
**Qui** : `movement.control` (CC), distinct du déclarant et du confirmateur.
Mouvement `confirmed` uniquement (`409 MOVEMENT_STATE_INVALID`). →
`200 { "state": "validated" }`.

#### `POST /v1/groups/{groupId}/movements/{movementId}/rejections`
**Qui** : T, TA, CC, ou le bénéficiaire d'une remise ; jamais le déclarant.
`{ "reason": "Montant reçu : 5 000 seulement" }` (3–500) →
`200 { "state": "rejected" }`. Le déclarant est notifié ; la réservation sur
l'échéance est libérée.

### 6.8 Amendes

États : `issued` → `contested` | `paid` | `cancelled` ; `contested` → `issued` | `cancelled`.

#### `POST /v1/groups/{groupId}/fines` — constater une amende
**Qui** : `fine.issue` (Censeur, P, VP), jamais à soi-même.

| `kind` | Montant |
|---|---|
| `meeting_late`, `meeting_absence` | fixé par le barème (`amount` ignoré) |
| `late_contribution` | calculé depuis l'échéance : `obligationId` requis ; fixe + par jour au-delà de la grâce, plafonné |
| `indiscipline` | `amount` requis, ≤ `indisciplineCap` |

```json
{ "membershipId": "mem_clarisse", "kind": "indiscipline", "amount": 500, "reason": "Téléphone en pleine séance" }
```
→ `201 { "fineId": "fine_…", "amount": "500" }`. Montant au-dessus du
plafond ou nul au barème : `422 FINE_INVALID`.

Le paiement passe par un mouvement `fine_payment` (`relatedId` = `fineId`) ;
l'amende passe à `paid` quand ce mouvement est validé.

#### `POST /v1/groups/{groupId}/fines/{fineId}/{act}`
`act` ∈ `contest`, `uphold`, `cancel`. Corps `{ "reason": "…" }`.

| `act` | Qui | Règle |
|---|---|---|
| `contest` | le membre concerné | motif ≥ 3 caractères |
| `uphold` | `member.admit` (P, VP), pas sur sa propre amende | |
| `cancel` | `member.admit`, pas sur sa propre amende | motif ≥ 3 caractères |

→ `200 { "state": "contested" | "issued" | "cancelled" }`.

#### `GET /v1/groups/{groupId}/fines`
**Qui** : membre actif ; le bureau et la transparence `all_members` voient
tout, sinon ses seules amendes. **snake_case** : `fine_id`, `membership_id`,
`display_name`, `kind`, `amount`, `reason`, `state`, `issued_at`, `meeting_id`.

### 6.9 Secours

États : `requested` → `approved` | `rejected` ; `approved` → `paid`.

#### `POST /v1/groups/{groupId}/aids` — demander un secours
**Qui** : membre actif (`aid.request`), pour soi ou pour un autre membre.
```json
{ "beneficiaryMembershipId": "mem_clarisse", "event": "birth", "eventDate": "2026-11-20", "note": "Naissance de Junior" }
```
→ `201 { "aidId": "aid_…", "amount": "20000" }` (montant du barème). Événement
non couvert : `422 AID_INVALID` ; plafond annuel atteint : `409 AID_CAP_EXCEEDED`.
Le secours est imputé sur la caisse de secours (`solidarity`).

#### `POST /v1/groups/{groupId}/aids/{aidId}/decisions`
**Qui** : `aid.decide` (P, VP, SG, T), jamais le bénéficiaire
(`403 APPROVER_NOT_DISTINCT`).
```json
{ "decision": "approve", "overrideAmount": null, "overrideReason": null, "note": null }
```
→ `200 { "state": "approved", "amount": "20000" }`. Un montant hors barème
exige `overrideReason` et reste ≤ 2 × barème.

#### `POST /v1/groups/{groupId}/aids/{aidId}/payments`
**Qui** : Trésorier ou Trésorier adjoint ; secours `approved`.
`{ "channel": "cash" }` → `201 { "movementId": "mv_…", "state": "declared" }`.
C'est une remise : le bénéficiaire confirme, le commissaire valide, le
secours passe à `paid`.

#### `GET /v1/groups/{groupId}/aids`
**Qui** : membre actif. **snake_case** : `aid_id`,
`beneficiary_membership_id`, `display_name`, `event`, `event_date`, `amount`,
`state`, `requested_at`, `decided_at`.

### 6.10 Dettes

États : `open` → `settled` | `written_off`.

#### `POST /v1/groups/{groupId}/debts`
**Qui** : `debt.manage` (P, VP, T).
```json
{ "debtorMembershipId": "mem_clarisse", "origin": "unpaid_obligation", "amount": 10000, "creditorFundId": null, "originRef": null }
```
→ `201 { "debtId": "debt_…" }`. L'avaliseur (parrain à l'admission) est
rattaché ; débiteur et avaliseur sont notifiés. Le règlement passe par des
mouvements `advance_repayment` (`relatedId` = `debtId`), imputés à la validation.

#### `POST /v1/groups/{groupId}/debts/{debtId}/write-off`
**Qui** : `debt.manage`, jamais pour sa propre dette (`403 APPROVER_NOT_DISTINCT`).
`{ "reason": "Décision de l'assemblée du 12/12" }` → `204`.

#### `GET /v1/groups/{groupId}/debts`
**Qui** : membre actif ; le bureau voit tout, un membre les dettes dont il est
débiteur ou avaliseur. **snake_case** : `debt_id`, `debtor_membership_id`,
`display_name`, `origin`, `amount`, `settled`, `state`,
`guarantor_membership_id`, `guarantor_name`, `created_at`.

### 6.11 Statuts

#### `POST /v1/groups/{groupId}/statutes` — générer et publier
**Qui** : `statutes.publish` (P, VP, SG). Pas de corps. Le texte est généré
depuis le règlement, les caisses, le bureau et le calendrier.
→ `201 { "version": 1, "hash": "<64 hex>" }` (même version si le texte n'a pas changé).

#### `GET /v1/groups/{groupId}/statutes`
**Qui** : membre actif. → `200` dernière version ou `null` ; **snake_case** :
`version`, `title`, `body`, `hash`, `published_at`, `accepted_by_me`, `acceptances`.

#### `POST /v1/groups/{groupId}/statutes/{version}/acceptances`
**Qui** : membre actif. `{ "hash": "<hash lu>" }` → `204` (idempotent).
Empreinte périmée : `412 RULE_ACCEPT_HASH_MISMATCH`.

### 6.12 Historique

#### `POST /v1/groups/{groupId}/history-imports`
**Qui** : `import.history` (P, VP). Reprise **en lecture seule** d'un export
de l'ancienne application ; une seule fois par njangi (`422 IMPORT_INVALID`).
```json
{ "njangi": {
  "id": "fb-njangi-1", "name": "Ancien njangi",
  "members": [{ "uid": "u1", "name": "Brice", "role": "membre" }],
  "contributions": [{ "id": "c1", "uid": "u1", "amount": 10000, "date": "2025-03-08", "status": "confirmed" }]
} }
```
→ `201 { "importId": "imp_…", "accepted": 2, "rejected": 0, "report": [{ "kind": "member", "legacyId": "u1", "accepted": true, "reason": null }, …] }`.
Une ligne fautive (montant non entier, membre inconnu, statut non confirmé…)
est rejetée avec son motif sans bloquer le reste. Les cotisations reprises
n'entrent dans aucun total courant. Rapprochement des membres par nom affiché.

#### `GET /v1/groups/{groupId}/history`
**Qui** : membre actif. **snake_case** : `legacy_id`, `legacy_member_name`,
`membership_id`, `amount`, `contribution_date`.

### 6.13 Notifications

Les notifications in-app ne portent **ni montant ni nom** (affichables écran
verrouillé). `target` indique où naviguer (`group:<id>:validations`,
`group:<id>:fines`, `group:<id>:meetings:<meetingId>`…).

#### `GET /v1/me/notifications`
**Qui** : toute session. 100 dernières, **snake_case** :
```json
[{ "notification_id": "42", "group_id": "grp_…", "kind": "validation_waiting",
   "target": "group:grp_…:validations", "created_at": "…", "read_at": null }]
```
`kind` ∈ `meeting_reminder`, `due_reminder`, `validation_waiting`,
`payout_recorded`, `fine_issued`, `aid_decided`, `order_change`,
`membership`, `minutes_ready`, `general`.

#### `POST /v1/me/notifications/{notificationId}/read`
**Qui** : toute session. `notificationId` numérique. → `204` (idempotent).

---

## 7. Énumérations

#### Cadence
| `kind` | Champs | Exemple de libellé |
|---|---|---|
| `daily` | `excludedWeekdays` (facultatif, ≤ 6) | chaque jour sauf le dimanche |
| `every_n_days` | `n` (2–31) | tous les 8 jours |
| `weekly` | `weekday` (0–6) | tous les dimanches |
| `biweekly` | `weekday` | tous les 15 jours |
| `monthly_day` | `day` (1–31) | le 5 du mois |
| `monthly_nth_weekday` | `nth` (1, 2, 3, 4, ou -1 = dernier), `weekday` | le 2e samedi du mois |

#### FundKind
`rotation` (Tontine/njangi), `solidarity` (Caisse de secours),
`year_end_reserve` (Réserve de fin d'année), `operating` (Fonds de caisse),
`fines` (Caisse des amendes), `loan` (Caisse de prêts, registre — drapeau
`loan_register`), `collector` (Collecte par un tontinier — drapeau `daily_collector`).

#### MovementKind
| `kind` | Sens | Usage |
|---|---|---|
| `contribution` | entrée | cotisation d'un membre |
| `fine_payment` | entrée | paiement d'une amende |
| `advance_repayment` | entrée | remboursement d'une dette ou avance |
| `transfer_in` | entrée | transfert entre caisses |
| `payout` | sortie | remise (cagnotte, secours) |
| `advance` | sortie | avance de la caisse à un membre |
| `transfer_out` | sortie | transfert entre caisses |
| `fee` | sortie | frais supportés par la caisse |
| `expense` | sortie | dépense de fonctionnement |

#### Autres
| Énumération | Valeurs |
|---|---|
| `PaymentChannel` | `cash` (Espèces), `orange_money`, `mtn_momo`, `bank`, `other` |
| `AttendanceStatus` | `present`, `late`, `excused`, `absent`, `represented` |
| `AidEvent` | `death_member`, `death_spouse`, `death_parent`, `death_child`, `birth`, `marriage`, `illness`, `other` |
| `FineKind` | `late_contribution`, `meeting_late`, `meeting_absence`, `indiscipline` |
| `DebtOrigin` | `unpaid_obligation`, `fund_advance`, `unpaid_fine`, `catch_up` |
| État du groupe | `configuration`, `active`, `paused`, `closed`, `stopped_with_discrepancies`, `archived` |
| État du calendrier | `none`, `draft`, `started` |
