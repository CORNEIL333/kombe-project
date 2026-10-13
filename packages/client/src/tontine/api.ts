/* KÓMBE — client HTTP de l'API « tontine réelle » (docs/API_TONTINE.md).
   Types : contrat partagé `@kombe/domain` (dto.ts), importé en type seulement.
   Règles :
   - la session est celle renvoyée par le serveur, portée en Bearer ;
   - toute écriture porte une clé d'idempotence (un double appui ou une
     reprise réseau ne crée jamais deux déclarations) ;
   - aucun état n'est présenté comme acquis avant la réponse du serveur. */

import type {
  AidView,
  AuthCodeRequestResult,
  AuthSessionResult,
  CreateTontineInput,
  DebtView,
  DeclareMovementInput,
  DueView,
  FineView,
  FundView,
  InvitationPreview,
  InvitationView,
  JournalEntryView,
  MeetingDetail,
  MeetingSummary,
  MeView,
  MemberView,
  MovementView,
  NotificationView,
  OrderChangeView,
  PayoutInput,
  RoundGridView,
  RoundView,
  StatutesView,
  TontineDetail,
  TontineSettings,
  TontineSummary,
} from "@kombe/domain";
import { ApiClient, ApiError, loadRuntimeConfig } from "@kombe/dashboard-core";

export { ApiError };
export type {
  AidView,
  DebtView,
  DueView,
  FineView,
  FundView,
  InvitationPreview,
  InvitationView,
  JournalEntryView,
  MeetingDetail,
  MeetingSummary,
  MeView,
  MemberView,
  MovementView,
  NotificationView,
  OrderChangeView,
  RoundGridView,
  RoundView,
  StatutesView,
  TontineDetail,
  TontineSettings,
  TontineSummary,
};

const CLE_SESSION = "kombe.session";

export interface Session {
  readonly sessionId: string;
  readonly identityId: string;
  readonly expiresAt: number;
}

/** Session mémorisée sur l'appareil (jamais d'état financier, seulement le jeton). */
export function sessionMemorisee(): Session | null {
  try {
    const brut = window.localStorage.getItem(CLE_SESSION);
    if (!brut) return null;
    const s = JSON.parse(brut) as Session;
    if (typeof s.sessionId !== "string" || typeof s.expiresAt !== "number" || s.expiresAt < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function memoriserSession(s: Session | null): void {
  try {
    if (s) window.localStorage.setItem(CLE_SESSION, JSON.stringify(s));
    else window.localStorage.removeItem(CLE_SESSION);
  } catch {
    /* stockage indisponible (navigation privée) : la session reste en mémoire */
  }
}

let clientPromise: Promise<ApiClient> | null = null;
function client(): Promise<ApiClient> {
  clientPromise ??= loadRuntimeConfig().then((config) => new ApiClient({ baseUrl: config.apiBaseUrl, timeoutMs: 20000 }));
  return clientPromise;
}

/** Réservé aux tests : oublie le client mémoïsé. */
export function reinitialiserClient(): void {
  clientPromise = null;
}

function cleIdempotence(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

type Methode = "GET" | "POST" | "PUT" | "PATCH";

async function appel<T>(session: Session | null, methode: Methode, chemin: string, corps?: unknown, query?: Record<string, string | undefined>): Promise<T> {
  const api = await client();
  const headers: Record<string, string> = {};
  if (session) headers.authorization = `Bearer ${session.sessionId}`;
  if (methode !== "GET") headers["idempotency-key"] = cleIdempotence();
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") q[k] = v;
  return api.request<T>(chemin, {
    method: methode,
    headers,
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : methode === "GET" ? {} : { body: "{}" }),
    ...(Object.keys(q).length ? { query: q } : {}),
  });
}

const t = (id: string) => `/v1/tontines/${encodeURIComponent(id)}`;

/* ── Accès ─────────────────────────────────────────────────────────────── */

export const acces = {
  canaux: () => appel<{ sms: boolean; whatsapp: boolean; email: boolean }>(null, "GET", "/v1/auth/channels"),
  demanderCode: (login: string, channel?: "sms" | "whatsapp" | "email") =>
    appel<AuthCodeRequestResult>(null, "POST", "/v1/auth/code-requests", { login, ...(channel ? { channel } : {}) }),
  verifierCode: (login: string, code: string) => appel<AuthSessionResult>(null, "POST", "/v1/auth/code-verifications", { login, code }),
  deconnexion: (s: Session) => appel<void>(s, "POST", "/v1/auth/logout"),
  moi: (s: Session) => appel<MeView>(s, "GET", "/v1/me"),
  majMoi: (s: Session, maj: { displayName?: string; language?: "fr" | "en" }) => appel<MeView>(s, "PATCH", "/v1/me", maj),
  mesTontines: (s: Session) => appel<TontineSummary[]>(s, "GET", "/v1/me/tontines"),
  mesEcheances: (s: Session, groupId?: string) => appel<DueView[]>(s, "GET", "/v1/me/dues", undefined, { groupId }),
  notifications: (s: Session, nonLues = false) =>
    appel<NotificationView[]>(s, "GET", "/v1/me/notifications", undefined, nonLues ? { unread: "1" } : {}),
  marquerLues: (s: Session, ids: string[] | "all") => appel<void>(s, "POST", "/v1/me/notifications/read", { ids }),
};

/* ── Association ───────────────────────────────────────────────────────── */

export const tontines = {
  creer: (s: Session, input: CreateTontineInput) => appel<TontineDetail>(s, "POST", "/v1/tontines", input),
  detail: (s: Session, id: string) => appel<TontineDetail>(s, "GET", t(id)),
  majReglement: (s: Session, id: string, name: string, settings: TontineSettings) =>
    appel<TontineDetail>(s, "PATCH", `${t(id)}/settings`, { name, settings }),
  membres: (s: Session, id: string) => appel<MemberView[]>(s, "GET", `${t(id)}/members`),
  ajouterHorsLigne: (s: Session, id: string, displayName: string, proxyMembershipId: string) =>
    appel<MemberView>(s, "POST", `${t(id)}/members/offline`, { displayName, proxyMembershipId }),
  admission: (s: Session, id: string, mid: string, decision: "admit" | "reject", shares?: number) =>
    appel<MemberView>(s, "POST", `${t(id)}/members/${encodeURIComponent(mid)}/admission`, { decision, ...(shares ? { shares } : {}) }),
  parts: (s: Session, id: string, mid: string, shares: number) =>
    appel<MemberView>(s, "POST", `${t(id)}/members/${encodeURIComponent(mid)}/shares`, { shares }),
  proposerRole: (s: Session, id: string, membershipId: string, role: string, mandateEnd?: string) =>
    appel<MemberView>(s, "POST", `${t(id)}/roles`, { membershipId, role, ...(mandateEnd ? { mandateEnd } : {}) }),
  accepterRole: (s: Session, id: string, role: string) => appel<MemberView>(s, "POST", `${t(id)}/roles/acceptance`, { role }),
  creerInvitation: (s: Session, id: string, maxUses?: number, days?: number) =>
    appel<InvitationView>(s, "POST", `${t(id)}/invitations`, { ...(maxUses ? { maxUses } : {}), ...(days ? { days } : {}) }),
  invitations: (s: Session, id: string) => appel<InvitationView[]>(s, "GET", `${t(id)}/invitations`),
  revoquerInvitation: (s: Session, id: string, iid: string) =>
    appel<void>(s, "POST", `${t(id)}/invitations/${encodeURIComponent(iid)}/revocation`),
  apercuInvitation: (s: Session, code: string) => appel<InvitationPreview>(s, "GET", `/v1/invitations/${encodeURIComponent(code)}`),
  rejoindre: (s: Session, code: string, displayName: string, sponsorMembershipId?: string) =>
    appel<TontineSummary>(s, "POST", `/v1/invitations/${encodeURIComponent(code)}/join`, {
      displayName,
      ...(sponsorMembershipId ? { sponsorMembershipId } : {}),
    }),
};

/* ── Statuts, cycle, ordre ─────────────────────────────────────────────── */

export const reglement = {
  statuts: (s: Session, id: string) => appel<StatutesView>(s, "GET", `${t(id)}/statutes`),
  publier: (s: Session, id: string) => appel<StatutesView>(s, "POST", `${t(id)}/statutes`),
  accepter: (s: Session, id: string, hash: string) => appel<StatutesView>(s, "POST", `${t(id)}/statutes/acceptance`, { hash }),
};

export const cycle = {
  engagerTirage: (s: Session, id: string) => appel<{ drawId: string; commitment: string }>(s, "POST", `${t(id)}/draws`),
  tirage: (s: Session, id: string, drawId: string) =>
    appel<{ commitment: string; seed: string | null; result: string[] | null }>(s, "GET", `${t(id)}/draws/${encodeURIComponent(drawId)}`),
  demarrer: (s: Session, id: string, order: "draw" | "manual" | "join_order", drawId?: string, membershipOrder?: string[]) =>
    appel<TontineDetail>(s, "POST", `${t(id)}/cycle`, { order, ...(drawId ? { drawId } : {}), ...(membershipOrder ? { membershipOrder } : {}) }),
  tours: (s: Session, id: string) => appel<RoundView[]>(s, "GET", `${t(id)}/rounds`),
  grille: (s: Session, id: string, seq: number) => appel<RoundGridView>(s, "GET", `${t(id)}/rounds/${seq}/grid`),
  remise: (s: Session, id: string, seq: number, input: PayoutInput) => appel<MovementView>(s, "POST", `${t(id)}/rounds/${seq}/payout`, input),
  clore: (s: Session, id: string, seq: number) => appel<RoundView>(s, "POST", `${t(id)}/rounds/${seq}/close`),
  echanges: (s: Session, id: string) => appel<OrderChangeView[]>(s, "GET", `${t(id)}/order-changes`),
  demanderEchange: (s: Session, id: string, seqA: number, seqB: number, reason?: string) =>
    appel<OrderChangeView>(s, "POST", `${t(id)}/order-changes`, { kind: "swap", seqA, seqB, ...(reason ? { reason } : {}) }),
  accepterEchange: (s: Session, id: string, cid: string) =>
    appel<OrderChangeView>(s, "POST", `${t(id)}/order-changes/${encodeURIComponent(cid)}/acceptance`),
  approuverEchange: (s: Session, id: string, cid: string) =>
    appel<OrderChangeView>(s, "POST", `${t(id)}/order-changes/${encodeURIComponent(cid)}/approval`),
};

/* ── Séances ───────────────────────────────────────────────────────────── */

export const seances = {
  liste: (s: Session, id: string) => appel<MeetingSummary[]>(s, "GET", `${t(id)}/meetings`),
  detail: (s: Session, id: string, mid: string) => appel<MeetingDetail>(s, "GET", `${t(id)}/meetings/${encodeURIComponent(mid)}`),
  ouvrir: (s: Session, id: string, mid: string) => appel<MeetingDetail>(s, "POST", `${t(id)}/meetings/${encodeURIComponent(mid)}/open`),
  presence: (
    s: Session,
    id: string,
    mid: string,
    entries: { membershipId: string; status: string; representedByMembershipId?: string | null }[],
  ) => appel<MeetingDetail>(s, "PUT", `${t(id)}/meetings/${encodeURIComponent(mid)}/attendance`, { entries }),
  clore: (s: Session, id: string, mid: string, notes?: string, decisions?: string[]) =>
    appel<MeetingDetail>(s, "POST", `${t(id)}/meetings/${encodeURIComponent(mid)}/close`, {
      ...(notes ? { notes } : {}),
      ...(decisions && decisions.length ? { decisions } : {}),
    }),
  approuverPv: (s: Session, id: string, mid: string, hash: string) =>
    appel<MeetingDetail>(s, "POST", `${t(id)}/meetings/${encodeURIComponent(mid)}/minutes-approval`, { hash }),
};

/* ── Caisses et mouvements ─────────────────────────────────────────────── */

export const argent = {
  caisses: (s: Session, id: string) => appel<FundView[]>(s, "GET", `${t(id)}/funds`),
  mouvements: (s: Session, id: string, filtre: { fundId?: string; roundSeq?: number; state?: string; meetingId?: string; mine?: boolean } = {}) =>
    appel<MovementView[]>(s, "GET", `${t(id)}/movements`, undefined, {
      fundId: filtre.fundId,
      roundSeq: filtre.roundSeq !== undefined ? String(filtre.roundSeq) : undefined,
      state: filtre.state,
      meetingId: filtre.meetingId,
      mine: filtre.mine ? "1" : undefined,
    }),
  declarer: (s: Session, id: string, input: DeclareMovementInput) => appel<MovementView>(s, "POST", `${t(id)}/movements`, input),
  confirmerLot: (s: Session, id: string, movementIds: string[]) =>
    appel<MovementView[]>(s, "POST", `${t(id)}/movements/confirmations`, { movementIds }),
  controler: (s: Session, id: string, mvid: string) => appel<MovementView>(s, "POST", `${t(id)}/movements/${encodeURIComponent(mvid)}/control`),
  rejeter: (s: Session, id: string, mvid: string, reason: string) =>
    appel<MovementView>(s, "POST", `${t(id)}/movements/${encodeURIComponent(mvid)}/rejection`, { reason }),
  accuserReception: (s: Session, id: string, mvid: string) =>
    appel<MovementView>(s, "POST", `${t(id)}/movements/${encodeURIComponent(mvid)}/acknowledgement`),
};

/* ── Discipline, secours, dettes, registre ─────────────────────────────── */

export const discipline = {
  amendes: (s: Session, id: string) => appel<FineView[]>(s, "GET", `${t(id)}/fines`),
  infliger: (s: Session, id: string, input: { membershipId: string; kind: string; amount?: string; reason: string; meetingId?: string }) =>
    appel<FineView>(s, "POST", `${t(id)}/fines`, input),
  contester: (s: Session, id: string, fid: string, reason: string) =>
    appel<FineView>(s, "POST", `${t(id)}/fines/${encodeURIComponent(fid)}/contest`, { reason }),
  annuler: (s: Session, id: string, fid: string, reason: string) =>
    appel<FineView>(s, "POST", `${t(id)}/fines/${encodeURIComponent(fid)}/cancel`, { reason }),
  maintenir: (s: Session, id: string, fid: string, reason: string) =>
    appel<FineView>(s, "POST", `${t(id)}/fines/${encodeURIComponent(fid)}/maintain`, { reason }),
  secours: (s: Session, id: string) => appel<AidView[]>(s, "GET", `${t(id)}/aids`),
  demanderSecours: (s: Session, id: string, input: { beneficiaryMembershipId?: string; event: string; eventDate: string; note?: string }) =>
    appel<AidView>(s, "POST", `${t(id)}/aids`, input),
  deciderSecours: (s: Session, id: string, aid: string, decision: "approve" | "reject", note?: string) =>
    appel<AidView>(s, "POST", `${t(id)}/aids/${encodeURIComponent(aid)}/decision`, { decision, ...(note ? { note } : {}) }),
  remettreSecours: (s: Session, id: string, aid: string, channel: string, reference?: string) =>
    appel<MovementView>(s, "POST", `${t(id)}/aids/${encodeURIComponent(aid)}/payout`, { channel, ...(reference ? { reference } : {}) }),
  dettes: (s: Session, id: string) => appel<DebtView[]>(s, "GET", `${t(id)}/debts`),
  abandonnerDette: (s: Session, id: string, did: string, reason: string) =>
    appel<DebtView>(s, "POST", `${t(id)}/debts/${encodeURIComponent(did)}/write-off`, { reason }),
  journal: (s: Session, id: string) => appel<{ valid: boolean; entries: JournalEntryView[] }>(s, "GET", `${t(id)}/journal`),
};

/** Message d'erreur affichable : le serveur renvoie un motif métier en français. */
export function messageErreur(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0 || /timeout|abort/i.test(err.message)) return "Réseau indisponible. Réessayez quand la connexion revient.";
    return err.message || `Erreur ${err.status}`;
  }
  if (err instanceof TypeError) return "Réseau indisponible. Réessayez quand la connexion revient.";
  return err instanceof Error ? err.message : String(err);
}

export function estSessionExpiree(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
