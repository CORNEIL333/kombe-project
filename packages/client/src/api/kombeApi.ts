/* KÓMBE — client HTTP RÉEL de la PWA (Piste A3 suite). Réutilise `ApiClient`
   de `@kombe/dashboard-core` (même frontière déjà prouvée côté dashboards :
   `fetch` réel, timeout, CSRF, `ApiError` typée) plutôt que de réinventer un
   wrapper. Couvre EXACTEMENT le périmètre déjà prouvé base réelle
   (`docs/PREUVES_PISTE_A3_SERVEUR.md`) : connexion par code email
   (ADR-0024) et déclaration/vue de cotisation (C06) — aucune autre route.
   `sessionId` est TOUJOURS celui renvoyé par le serveur (jamais choisi ici) ;
   porté en `Authorization: Bearer <sessionId>` sur les appels protégés. */

import { ApiClient, ApiError, loadRuntimeConfig } from "@kombe/dashboard-core";

export { ApiError };

export interface ObligationView {
  readonly obligationId: string;
  readonly groupId: string;
  readonly due: string;
  readonly validatedNet: string;
  readonly activeReserved: string;
  readonly remainingDue: string;
  readonly availableToDeclare: string;
  readonly contributionCount: number;
  readonly version: number;
}

export interface DeclarationReceipt {
  readonly commandId: string;
  readonly status: "applied" | "duplicate";
  readonly resultVersion: number;
  readonly eventHash: string;
  readonly obligationId: string;
  readonly remainingDue: string;
  readonly availableToDeclare: string;
}

export interface DeclarationInput {
  readonly obligationId: string;
  readonly amount: string;
  readonly channel: "cash" | "electronic";
  readonly allegedDate: string;
}

let clientPromise: Promise<ApiClient> | null = null;

/** Construit (une seule fois, mémoïsé) le client réel — base URL lue au
 *  chargement via `/kombe-dashboard-config.json` ou `VITE_KOMBE_API_BASE_URL`
 *  (même mécanisme que les 4 dashboards, `@kombe/dashboard-core`). */
function client(): Promise<ApiClient> {
  clientPromise ??= loadRuntimeConfig().then((config) => new ApiClient({ baseUrl: config.apiBaseUrl }));
  return clientPromise;
}

function authHeaders(sessionId: string, extra?: Record<string, string>): HeadersInit {
  return { authorization: `Bearer ${sessionId}`, ...(extra ?? {}) };
}

/** Étape 1/2 de la connexion (ADR-0024) : envoie un code à usage unique par
 *  email. Réponse anti-énumération côté serveur — ne révèle jamais si le
 *  compte existe. */
export async function demanderConnexion(identityId: string): Promise<void> {
  const api = await client();
  await api.post("/v1/access/login-requests", { identityId });
}

/** Étape 2/2 : vérifie le code reçu, obtient un `sessionId` RÉEL généré
 *  SERVEUR (jamais choisi par la PWA). */
export async function confirmerConnexion(
  identityId: string,
  code: string,
): Promise<{ readonly sessionId: string; readonly expiresAt: number }> {
  const api = await client();
  return api.post<{ sessionId: string; expiresAt: number }>("/v1/access/login-completions", { identityId, code });
}

/* --- Création de compte RÉELLE (C02, ADR-0024) ---
   Le PWA n'offrait QUE la connexion : un nouvel utilisateur ne pouvait pas
   créer de compte (`login-requests` renvoie `accepted` MAIS n'envoie aucun code
   et n'active aucun compte pour une email inconnue — anti-énumération serveur,
   `pgAccessStore.requestLogin`). Ces deux fonctions branchent le contrat
   d'inscription DÉJÀ PRÉSENT et PROUVÉ côté serveur (`/v1/access/registrations
   (/verifications)`, le même que le mobile `HttpAuthRepository`). La PWA ne
   choisit jamais son identité : l'activation vient du serveur depuis l'email
   vérifié ; la session reste délivrée uniquement par login-completions. --- */

/** Étape 1/2 de l'inscription (`POST /v1/access/registrations`) : crée
 *  l'identité + le compte (`pending_verification`) et envoie un code de
 *  vérification du canal email. Réponse anti-énumération (202) dans tous les
 *  cas — ne révèle jamais si l'email existe déjà. */
export async function creerCompte(identityId: string): Promise<void> {
  const api = await client();
  await api.post("/v1/access/registrations", { identityId, channel: "email" });
}

/** Étape 2/2 de l'inscription (`POST /v1/access/registrations/verifications`) :
 *  vérifie le code et ACTIVE le compte côté serveur. Ne délivre PAS de session
 *  (state serveur renvoyé) ; après activation, l'utilisateur se connecte via
 *  `demanderConnexion`/`confirmerConnexion`. */
export async function verifierInscription(
  identityId: string,
  code: string,
): Promise<{ readonly state: string }> {
  const api = await client();
  return api.post<{ state: string }>("/v1/access/registrations/verifications", { identityId, code });
}

/** Vue de l'obligation : capacité sous verrou et restant dû (lecture
 *  authentifiée — anti-IDOR serveur, adhésion active requise dans ce groupe). */
export async function voirObligation(
  sessionId: string,
  groupId: string,
  obligationId: string,
  signal?: AbortSignal,
): Promise<ObligationView> {
  const api = await client();
  return api.request<ObligationView>(
    `/v1/groups/${encodeURIComponent(groupId)}/obligations/${encodeURIComponent(obligationId)}`,
    { method: "GET", headers: authHeaders(sessionId) },
    signal,
  );
}

/** Déclaration RÉELLE (C06) : `if-match-version` EXIGÉ (concurrence
 *  optimiste, ADR-0006/0017) — toujours la version lue par `voirObligation`
 *  juste avant, jamais une valeur par défaut. `idempotency-key` neuve à
 *  chaque appel distinct (un rejeu volontaire doit réutiliser la MÊME clé). */
export async function declarerCotisation(
  sessionId: string,
  groupId: string,
  decl: DeclarationInput,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<DeclarationReceipt> {
  const api = await client();
  return api.post<DeclarationReceipt>(
    `/v1/groups/${encodeURIComponent(groupId)}/declarations`,
    decl,
    authHeaders(sessionId, { "idempotency-key": idempotencyKey, "if-match-version": String(expectedVersion) }),
  );
}

/* --- Amorçage des tontines (C03, 0024) — routes RÉELLEMENT prouvées base
   réelle (`packages/api/test/pgOnboardingStore.proof.mjs`) : créer une tontine
   (nom + modèle + typologie + parent de supervision), découvrir les tontines
   publiques, rejoindre par code, demander un parrainage. Les décisions
   (devise/fuseau/identités/typologie P1 non démarrable) restent SERVEUR : la
   PWA n'appelle le contrat, elle ne choisit jamais son identité métier. --- */

export type ModeleTontine =
  | "famille"
  | "collegues"
  | "fetes"
  | "construction"
  | "etudiant"
  | "personnalise";

export type TypologieRotation = "rotative_fermee" | "tirage" | "negocie";

export interface CreationTontineInput {
  readonly groupId: string;
  readonly displayName: string;
  readonly tontineModel: ModeleTontine;
  readonly rotationType: TypologieRotation;
  readonly parentGroupId?: string | undefined;
}

export interface TontineCreee {
  readonly state: string;
  readonly groupId: string;
  readonly tontineModel?: ModeleTontine;
  readonly rotationType?: TypologieRotation;
}

/** Créer une tontine (`POST /v1/groups`) — session OBLIGATOIRE (anti-spam
 *  anonyme, §14) ; le créateur/acteur est résolu serveur depuis le Bearer. */
export async function creerTontine(
  sessionId: string,
  input: CreationTontineInput,
): Promise<TontineCreee> {
  const api = await client();
  const corps: Record<string, string> = {
    groupId: input.groupId,
    displayName: input.displayName,
    tontineModel: input.tontineModel,
    rotationType: input.rotationType,
  };
  if (input.parentGroupId) corps.parentGroupId = input.parentGroupId;
  return api.post<TontineCreee>("/v1/groups", corps, authHeaders(sessionId));
}

export interface TontineDecouvrable {
  readonly groupId: string;
  readonly groupName: string;
  readonly tontineModel: ModeleTontine;
  readonly rotationType: TypologieRotation;
  readonly revealsRegistry: boolean;
}

/** Découvrabilité publique (`GET /v1/discoverable-groups`) — aucune session,
 *  aucun registre réel (nom + modèle + typologie seulement). */
export async function repertorierTontines(
  signal?: AbortSignal,
): Promise<readonly TontineDecouvrable[]> {
  const api = await client();
  return api.request<readonly TontineDecouvrable[]>(
    "/v1/discoverable-groups",
    { method: "GET" },
    signal,
  );
}

/** Rejoindre par code reçu (`POST /v1/invitations/:code/redemptions`) — le
 *  racheteur est l'acteur de session (Bearer), jamais un champ du client. */
export async function rejoindreParCode(
  sessionId: string,
  invitationCode: string,
): Promise<void> {
  const api = await client();
  await api.post(
    `/v1/invitations/${encodeURIComponent(invitationCode)}/redemptions`,
    {},
    authHeaders(sessionId),
  );
}

export interface ParrainageInput {
  readonly groupId: string;
  readonly sponsorshipId: string;
  readonly candidateId: string;
  readonly sponsorId: string;
}

/** Parrainage / cooptation (`POST /v1/groups/:id/sponsorships`) — le CANDIDAT
 *  est l'acteur de session résolu serveur ; le corps porte un `candidateId`
 *  seulement pour satisfaire le contrat de schéma. Le parrain (CIBLE) doit être
 *  membre actif réel, vérifié serveur. */
export async function demanderParrainage(
  sessionId: string,
  input: ParrainageInput,
): Promise<void> {
  const api = await client();
  await api.post(
    `/v1/groups/${encodeURIComponent(input.groupId)}/sponsorships`,
    {
      sponsorshipId: input.sponsorshipId,
      candidateId: input.candidateId,
      sponsorId: input.sponsorId,
    },
    authHeaders(sessionId),
  );
}
