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
  DecisionView,
  SanctionView,
  HistoryImportResult,
  HistorySummary,
  Cadence,
  PaymentChannel,
} from "@kombe/domain";
import { ApiClient, ApiError, loadRuntimeConfig } from "@kombe/dashboard-core";
import { EnFileAttente, envoyerFile, estErreurReseau, mettreEnFile } from "./fileAttente.js";

export { ApiError };
export type {
  AidView,
  DebtView,
  DecisionView,
  HistoryImportResult,
  HistorySummary,
  SanctionView,
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

/** Écriture gardable sans réseau (mode séance, L-05) : groupe + libellé affiché. */
interface HorsLigne {
  readonly groupId: string;
  readonly libelle: string;
}

async function appel<T>(
  session: Session | null,
  methode: Methode,
  chemin: string,
  corps?: unknown,
  query?: Record<string, string | undefined>,
  horsLigne?: HorsLigne,
): Promise<T> {
  const api = await client();
  const headers: Record<string, string> = {};
  if (session) headers.authorization = `Bearer ${session.sessionId}`;
  const cle = methode !== "GET" ? cleIdempotence() : "";
  if (cle) headers["idempotency-key"] = cle;
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") q[k] = v;
  try {
    return await api.request<T>(chemin, {
      method: methode,
      headers,
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : methode === "GET" ? {} : { body: "{}" }),
      ...(Object.keys(q).length ? { query: q } : {}),
    });
  } catch (err) {
    if (horsLigne && (methode === "POST" || methode === "PUT") && estErreurReseau(err)) {
      throw new EnFileAttente(mettreEnFile({ groupId: horsLigne.groupId, libelle: horsLigne.libelle, methode, chemin, corps: corps ?? {}, cle }));
    }
    throw err;
  }
}

/** Envoie les opérations gardées sur ce téléphone, avec leur clé d'origine. */
export async function envoyerEnAttente(session: Session): Promise<{ envoyees: number; refusees: number; restantes: number }> {
  const api = await client();
  return envoyerFile(
    async (op) => {
      await api.request<unknown>(op.chemin, {
        method: op.methode,
        headers: { authorization: `Bearer ${session.sessionId}`, "idempotency-key": op.cle },
        body: JSON.stringify(op.corps),
      });
    },
    (err) => (err instanceof ApiError ? { status: err.status, message: err.message } : null),
  );
}

const t = (id: string) => `/v1/tontines/${encodeURIComponent(id)}`;

/* ── Accès ─────────────────────────────────────────────────────────────── */

export const acces = {
  canaux: () => appel<{ sms: boolean; whatsapp: boolean; email: boolean; neonAuthUrl?: string | null }>(null, "GET", "/v1/auth/channels"),
  /** Jeton Neon Auth (e-mail prouvé par Neon) → session KÓMBE (ADR-0040). */
  echangerNeon: (token: string) => appel<AuthSessionResult>(null, "POST", "/v1/auth/neon-exchange", { token }),
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
  membres: (s: Session, id: string, tous = false) => appel<MemberView[]>(s, "GET", `${t(id)}/members`, undefined, tous ? { all: "1" } : undefined),
  ajouterHorsLigne: (s: Session, id: string, displayName: string, proxyMembershipId: string) =>
    appel<MemberView>(s, "POST", `${t(id)}/members/offline`, { displayName, proxyMembershipId }),
  admission: (s: Session, id: string, mid: string, decision: "admit" | "reject", shares?: number) =>
    appel<MemberView>(s, "POST", `${t(id)}/members/${encodeURIComponent(mid)}/admission`, { decision, ...(shares ? { shares } : {}) }),
  parts: (s: Session, id: string, mid: string, shares: number) =>
    appel<MemberView>(s, "POST", `${t(id)}/members/${encodeURIComponent(mid)}/shares`, { shares }),
  partager: (s: Session, id: string, mid: string, sharedWith: string | null) =>
    appel<MemberView>(s, "POST", `${t(id)}/members/${encodeURIComponent(mid)}/shares`, { shares: 1, sharedWith }),
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
  /** Nouveau cycle quand tous les tours sont clos : les tours continuent (N+1…). */
  renouveler: (s: Session, id: string, order: "draw" | "manual" | "join_order", drawId?: string, membershipOrder?: string[]) =>
    appel<TontineDetail>(s, "POST", `${t(id)}/cycle-renewals`, { order, ...(drawId ? { drawId } : {}), ...(membershipOrder ? { membershipOrder } : {}) }),
  monTour: (s: Session, id: string) => appel<Prevision>(s, "GET", `${t(id)}/my-forecast`),
  regularite: (s: Session, id: string) => appel<LigneRegularite[]>(s, "GET", `${t(id)}/regularity`),
  simuler: (s: Session, input: { cadence: Cadence; firstMeetingDate: string; shares: number; contributionPerShare: string; sidePerMeeting?: string }) =>
    appel<Simulation>(s, "POST", "/v1/cycle-simulations", input),
  tours: (s: Session, id: string) => appel<RoundView[]>(s, "GET", `${t(id)}/rounds`),
  grille: (s: Session, id: string, seq: number) => appel<RoundGridView>(s, "GET", `${t(id)}/rounds/${seq}/grid`),
  remise: (s: Session, id: string, seq: number, input: PayoutInput) => appel<MovementView>(s, "POST", `${t(id)}/rounds/${seq}/payout`, input),
  clore: (s: Session, id: string, seq: number) => appel<RoundView>(s, "POST", `${t(id)}/rounds/${seq}/close`),
  echanges: (s: Session, id: string) => appel<OrderChangeView[]>(s, "GET", `${t(id)}/order-changes`),
  demanderEchange: (s: Session, id: string, seqA: number, seqB: number, reason?: string) =>
    appel<OrderChangeView>(s, "POST", `${t(id)}/order-changes`, { kind: "swap", seqA, seqB, ...(reason ? { reason } : {}) }),
  /** Tour prioritaire (L-13) : j'avance mon tour `monTour` au tour `cible`. */
  demanderPriorite: (s: Session, id: string, monTour: number, cible: number, reason: string) =>
    appel<OrderChangeView>(s, "POST", `${t(id)}/order-changes`, { kind: "priority", seqA: monTour, seqB: cible, reason }),
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
  ) =>
    appel<MeetingDetail>(s, "PUT", `${t(id)}/meetings/${encodeURIComponent(mid)}/attendance`, { entries }, undefined, {
      groupId: id,
      libelle: `Appel de la séance (${entries.length} membre(s))`,
    }),
  clore: (s: Session, id: string, mid: string, notes?: string, decisions?: string[]) =>
    appel<MeetingDetail>(s, "POST", `${t(id)}/meetings/${encodeURIComponent(mid)}/close`, {
      ...(notes ? { notes } : {}),
      ...(decisions && decisions.length ? { decisions } : {}),
    }),
  approuverPv: (s: Session, id: string, mid: string, hash: string) =>
    appel<MeetingDetail>(s, "POST", `${t(id)}/meetings/${encodeURIComponent(mid)}/minutes-approval`, { hash }),
  /** Résumé prêt à coller dans le groupe WhatsApp (sans numéro de téléphone). */
  resume: (s: Session, id: string, mid: string) => appel<{ text: string }>(s, "GET", `${t(id)}/meetings/${encodeURIComponent(mid)}/share-text`),
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
  declarer: (s: Session, id: string, input: DeclareMovementInput) =>
    appel<MovementView>(s, "POST", `${t(id)}/movements`, input, undefined, { groupId: id, libelle: `Versement déclaré : ${input.amount} FCFA` }),
  confirmerLot: (s: Session, id: string, movementIds: string[]) =>
    appel<MovementView[]>(s, "POST", `${t(id)}/movements/confirmations`, { movementIds }, undefined, {
      groupId: id,
      libelle: `Confirmation de ${movementIds.length} versement(s)`,
    }),
  controler: (s: Session, id: string, mvid: string) => appel<MovementView>(s, "POST", `${t(id)}/movements/${encodeURIComponent(mvid)}/control`),
  rejeter: (s: Session, id: string, mvid: string, reason: string) =>
    appel<MovementView>(s, "POST", `${t(id)}/movements/${encodeURIComponent(mvid)}/rejection`, { reason }),
  accuserReception: (s: Session, id: string, mvid: string) =>
    appel<MovementView>(s, "POST", `${t(id)}/movements/${encodeURIComponent(mvid)}/acknowledgement`),
  /** Réserve de fin d'année rendue à chacun (une remise par membre et par exercice). */
  rendreReserve: (s: Session, id: string, input: { channel: PaymentChannel; reference?: string }) =>
    appel<RedistributionReserve>(s, "POST", `${t(id)}/reserve-distributions`, input),
};

/* ── Repères (ADR-0039) ─────────────────────────────────────────────────── */

export interface Simulation {
  readonly cadenceLabel: string;
  readonly meetings: number;
  readonly firstMeeting: string;
  readonly lastMeeting: string;
  readonly spanDays: number;
  readonly pot: string;
  readonly perMeetingPerShare: string;
  readonly totalPerShare: string;
  readonly dates: readonly string[];
  readonly summary: string;
}

export interface Prevision {
  readonly cycle: number | null;
  readonly totalDue: string;
  readonly totalToReceive: string;
  readonly confirmedSoFar: string;
  readonly turns: readonly {
    readonly seq: number;
    readonly date: string;
    readonly amount: string;
    readonly paidBeforeReceiving: string;
    readonly position: "group_advances_you" | "you_advance_group" | "even";
    readonly gap: string;
    readonly explanation: string;
    readonly received: boolean;
  }[];
}

export interface LigneRegularite {
  readonly membershipId: string;
  readonly name: string;
  readonly isMe: boolean;
  readonly dueSoFar: number;
  readonly onTime: number;
  readonly late: number;
  readonly unpaidLate: number;
  readonly openFines: number;
  readonly onTimeRate: number;
  readonly badge: "nouveau" | "exemplaire" | "régulier" | "à suivre" | "en retard";
}

export interface RedistributionReserve {
  readonly year: number;
  readonly available: string;
  readonly shortfall: boolean;
  readonly movements: readonly MovementView[];
  readonly waiting: readonly { readonly membershipId: string; readonly name: string | null; readonly amount: string; readonly reason: string }[];
}

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

export interface OuvertureDecision {
  readonly kind: DecisionView["kind"];
  readonly reason: string;
  readonly targetMembershipId?: string;
  readonly targetRole?: string;
  readonly hours?: number;
  readonly occurrences?: number;
  readonly incomingMembershipId?: string;
}

/** Décisions votées de l'assemblée (ADR-0038). */
export const decisions = {
  liste: (s: Session, id: string) => appel<DecisionView[]>(s, "GET", `${t(id)}/decisions`),
  ouvrir: (s: Session, id: string, input: OuvertureDecision) => appel<DecisionView>(s, "POST", `${t(id)}/decisions`, input),
  voter: (s: Session, id: string, did: string, choice: "yes" | "no" | "abstain") =>
    appel<DecisionView>(s, "POST", `${t(id)}/decisions/${encodeURIComponent(did)}/ballots`, { choice }),
  depouiller: (s: Session, id: string, did: string) => appel<DecisionView>(s, "POST", `${t(id)}/decisions/${encodeURIComponent(did)}/close`),
  annuler: (s: Session, id: string, did: string, reason: string) =>
    appel<DecisionView>(s, "POST", `${t(id)}/decisions/${encodeURIComponent(did)}/cancel`, { reason }),
  lever: (s: Session, id: string, did: string, reason: string) =>
    appel<DecisionView>(s, "POST", `${t(id)}/decisions/${encodeURIComponent(did)}/lift`, { reason }),
  sanctions: (s: Session, id: string) => appel<SanctionView[]>(s, "GET", `${t(id)}/sanctions`),
};

/** Reprise de l'historique (L-20), à part de tout total courant. */
export const historique = {
  resume: (s: Session, id: string) => appel<HistorySummary>(s, "GET", `${t(id)}/history`),
  importer: (
    s: Session,
    id: string,
    corps: { source: "cahier"; rows: readonly { memberName: string; date: string; amount: number }[]; label?: string } | { source: "kombe_v1"; njangi: unknown },
  ) => appel<HistoryImportResult>(s, "POST", `${t(id)}/history-imports`, corps),
};

/** Message d'erreur affichable : le serveur renvoie un motif métier en français. */
export function messageErreur(err: unknown): string {
  if (err instanceof EnFileAttente) return err.message;
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
