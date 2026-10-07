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
