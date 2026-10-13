/**
 * Contrat HTTP de l'application « tontine réelle » (API ↔ PWA ↔ mobile ↔
 * dashboards). Types seulement, aucune logique : la PWA et les dashboards
 * l'importent avec `import type`, l'API le respecte, `docs/API_TONTINE.md`
 * le décrit route par route.
 *
 * Conventions :
 *  - montants en chaînes d'entiers XAF (« 25000 »), jamais de flottant ;
 *  - dates métier AAAA-MM-JJ (Africa/Douala), instants en ISO 8601 UTC ;
 *  - identifiants opaques générés par le serveur ;
 *  - toute mutation accepte `idempotency-key` (rejeu sans double effet).
 */
import type { Cadence } from "./cadence.js";
import type { FundKind, MovementKind, MovementState, PaymentChannel, WithdrawalFeeBearer } from "./funds.js";
import type { FineKind, FineState } from "./discipline.js";
import type { AidEvent, AidState } from "./solidarity.js";
import type { GroupRole } from "./roles.js";
import type { Transparency } from "./statutes.js";
import type { MeetingState, AttendanceStatus } from "./meeting.js";
import type { PayoutPolicy } from "./debt.js";

export type Money = string;
export type IsoDate = string;
export type IsoInstant = string;
export type Language = "fr" | "en" | "pcm";

/* ── Accès ─────────────────────────────────────────────────────────────── */

export interface AuthCodeRequest {
  /** Numéro (+237…, 6XXXXXXXX, 00237…) ou e-mail. */
  readonly login: string;
  readonly channel?: "sms" | "whatsapp" | "email";
}
export interface AuthCodeRequestResult {
  readonly accepted: true;
  readonly login: string;
  readonly channel: "sms" | "whatsapp" | "email";
  /** Présent UNIQUEMENT avec le simulateur de développement (jamais en production). */
  readonly devCode?: string;
}
export interface AuthCodeVerification {
  readonly login: string;
  readonly code: string;
}
export interface AuthSessionResult {
  readonly sessionId: string;
  readonly expiresAt: number;
  readonly identityId: string;
}
export interface MeView {
  readonly identityId: string;
  readonly login: string;
  readonly displayName: string | null;
  readonly language: Language;
}
export interface MeUpdate {
  readonly displayName?: string;
  readonly language?: Language;
}

/* ── Règlement d'une association ───────────────────────────────────────── */

export interface FineScheduleDto {
  readonly lateContributionFixed: Money;
  readonly lateContributionPerDay: Money;
  readonly lateContributionCap: Money;
  readonly meetingLate: Money;
  readonly meetingAbsence: Money;
  readonly indisciplineCap: Money;
  readonly graceDays: number;
}
export interface AidScaleEntryDto {
  readonly event: AidEvent;
  readonly amount: Money;
  readonly maxPerYear: number;
}
export interface SideFundSetting {
  readonly enabled: boolean;
  /** Cotisation par séance (0 si aucune). */
  readonly perMeeting: Money;
}
export interface TontineSettings {
  /** Cotisation de rotation par part et par séance. */
  readonly contributionPerShare: Money;
  readonly cadence: Cadence;
  readonly firstMeetingDate: IsoDate;
  /** Heure limite de la cotisation, Africa/Douala (« 18:00 »). */
  readonly deadlineTime: string;
  readonly meetingPlace: string | null;
  readonly maxMembers: number;
  readonly transparency: Transparency;
  readonly feeBearer: WithdrawalFeeBearer;
  readonly payoutPolicy: PayoutPolicy;
  readonly newcomersLast: boolean;
  readonly guarantorRequired: boolean;
  /** Nombre de témoins présents exigés pour une remise (0 à 5, 2 par défaut). */
  readonly payoutWitnesses: number;
  readonly fines: FineScheduleDto;
  readonly solidarity: SideFundSetting & { readonly scale: readonly AidScaleEntryDto[] };
  readonly operating: SideFundSetting;
  readonly yearEndReserve: SideFundSetting;
}

export interface CreateTontineInput {
  readonly name: string;
  /** Votre nom tel que les membres le connaissent. */
  readonly founderDisplayName: string;
  readonly settings: TontineSettings;
}

/* ── Vues ──────────────────────────────────────────────────────────────── */

export type TontineState = "configuration" | "active" | "paused" | "closed" | "stopped_with_discrepancies" | "archived";
export type TontineMembershipState = "pending" | "active" | "departed" | "revoked";

export interface TontineSummary {
  readonly groupId: string;
  readonly name: string;
  readonly state: TontineState;
  readonly membershipId: string;
  readonly membershipState: TontineMembershipState;
  readonly roles: readonly GroupRole[];
  readonly memberCount: number;
  readonly contributionPerShare: Money;
  readonly nextMeetingDate: IsoDate | null;
  /** Ce que je dois encore pour la prochaine échéance (toutes caisses). */
  readonly myOpenDue: Money;
  /** Tour où je reçois la cagnotte, s'il est fixé. */
  readonly myPayoutDate: IsoDate | null;
}

export interface FundView {
  readonly fundId: string;
  readonly kind: FundKind;
  readonly name: string;
  readonly state: "active" | "closed";
  /** Total confirmé (entrées − sorties) : argent tenu par le trésorier, PAS par KÓMBE. */
  readonly confirmedBalance: Money;
  /** Déclaré en attente de confirmation (entrées). */
  readonly pendingIn: Money;
  readonly perMeeting: Money;
}

export interface MemberView {
  readonly membershipId: string;
  readonly displayName: string;
  readonly state: TontineMembershipState;
  readonly roles: readonly GroupRole[];
  /** Fonctions proposées, en attente d'acceptation par la personne nommée. */
  readonly pendingRoles: readonly GroupRole[];
  /** Numéro masqué (+237 6•• •• •• 12) ; complet pour le bureau et soi-même. */
  readonly login: string | null;
  readonly isMe: boolean;
  readonly sponsorMembershipId: string | null;
  readonly proxyMembershipId: string | null;
  /** Membre sans smartphone, représenté par un proche ou le secrétaire. */
  readonly offline: boolean;
  readonly joinedAt: IsoInstant | null;
  readonly shares: number;
}

export interface RoundView {
  readonly seq: number;
  readonly date: IsoDate;
  readonly state: "open" | "closed";
  readonly beneficiaryMembershipId: string | null;
  readonly beneficiaryName: string | null;
  readonly meetingId: string | null;
  /** Cagnotte attendue (parts × cotisation). */
  readonly expectedPot: Money;
  /** Cotisations de rotation confirmées pour ce tour. */
  readonly collected: Money;
  readonly payoutState: "none" | "declared" | "confirmed" | "received";
}

export interface TontineDetail {
  readonly groupId: string;
  readonly name: string;
  readonly state: TontineState;
  readonly settings: TontineSettings;
  readonly me: { readonly membershipId: string; readonly state: TontineMembershipState; readonly roles: readonly GroupRole[] };
  readonly memberCount: number;
  readonly pendingCount: number;
  readonly funds: readonly FundView[];
  readonly currentRound: RoundView | null;
  readonly nextMeeting: MeetingSummary | null;
  readonly statutes: { readonly version: number; readonly hash: string; readonly acceptedByMe: boolean } | null;
  readonly cycleStarted: boolean;
  readonly flags: readonly ("loan_register" | "auction" | "daily_collector")[];
}

export interface DueView {
  readonly groupId: string;
  readonly fundId: string;
  readonly fundKind: FundKind;
  readonly fundName: string;
  readonly roundSeq: number;
  readonly date: IsoDate;
  readonly due: Money;
  /** Confirmé par le trésorier. */
  readonly confirmed: Money;
  /** Déclaré, en attente de confirmation. */
  readonly declared: Money;
  readonly remaining: Money;
  readonly lateness: "upcoming" | "on_time" | "grace" | "late";
}

export interface InvitationView {
  readonly invitationId: string;
  readonly code: string;
  readonly url: string;
  readonly whatsappText: string;
  readonly expiresAt: IsoInstant;
  readonly maxUses: number;
  readonly usedCount: number;
  readonly revoked: boolean;
}
export interface InvitationPreview {
  readonly code: string;
  readonly groupName: string;
  readonly usable: boolean;
  readonly alreadyMember: boolean;
}

export interface MeetingSummary {
  readonly meetingId: string;
  readonly seq: number;
  readonly date: IsoDate;
  readonly state: MeetingState;
  readonly location: string | null;
  readonly hostName: string | null;
  readonly roundSeq: number | null;
  readonly minutesApproved: boolean;
}
export interface AttendanceView {
  readonly membershipId: string;
  readonly displayName: string;
  readonly status: AttendanceStatus | null;
  readonly representedByMembershipId: string | null;
}
export interface MeetingDetail extends MeetingSummary {
  readonly notes: string | null;
  readonly attendance: readonly AttendanceView[];
  readonly movements: readonly MovementView[];
  readonly fines: readonly FineView[];
  readonly minutes: { readonly text: string; readonly hash: string; readonly approvedAt: IsoInstant | null } | null;
}

export interface MovementView {
  readonly movementId: string;
  readonly fundId: string;
  readonly fundKind: FundKind;
  readonly kind: MovementKind;
  readonly amount: Money;
  readonly membershipId: string | null;
  readonly memberName: string | null;
  readonly roundSeq: number | null;
  readonly meetingId: string | null;
  readonly state: MovementState;
  readonly channel: PaymentChannel;
  readonly reference: string | null;
  readonly payerNote: string | null;
  readonly declaredBy: string;
  readonly declaredByName: string | null;
  readonly declaredAt: IsoInstant;
  readonly confirmedByName: string | null;
  readonly controlledByName: string | null;
  readonly rejectedReason: string | null;
  readonly relatedKind: string | null;
  readonly relatedId: string | null;
  readonly witnesses: readonly string[];
  readonly beneficiaryConfirmedAt: IsoInstant | null;
  /** Ce que la personne connectée peut faire sur ce mouvement. */
  readonly can: { readonly confirm: boolean; readonly control: boolean; readonly reject: boolean; readonly acknowledge: boolean };
}

export interface DeclareMovementInput {
  readonly fundId: string;
  readonly kind: "contribution" | "fine_payment" | "advance_repayment" | "expense" | "fee";
  readonly amount: Money;
  /** Membre concerné (par défaut : moi). « Payé par X pour Y » se trace dans payerNote. */
  readonly membershipId?: string;
  readonly roundSeq?: number;
  readonly meetingId?: string;
  readonly channel: PaymentChannel;
  readonly reference?: string;
  readonly justification?: string;
  readonly payerNote?: string;
  readonly allegedDate?: IsoDate;
  readonly relatedKind?: "fine" | "debt";
  readonly relatedId?: string;
}

export interface PayoutInput {
  readonly channel: PaymentChannel;
  readonly reference?: string;
  readonly justification?: string;
  readonly witnessMembershipIds: readonly string[];
  /** Montant remis ; par défaut la cagnotte collectée (ou attendue avec avance de caisse). */
  readonly amount?: Money;
  readonly policy?: PayoutPolicy;
  readonly meetingId?: string;
}

export interface FineView {
  readonly fineId: string;
  readonly membershipId: string;
  readonly memberName: string;
  readonly kind: FineKind;
  readonly amount: Money;
  readonly reason: string;
  readonly state: FineState;
  readonly issuedAt: IsoInstant;
  readonly issuedByName: string | null;
  readonly meetingId: string | null;
}

export interface AidView {
  readonly aidId: string;
  readonly beneficiaryMembershipId: string;
  readonly beneficiaryName: string;
  readonly event: AidEvent;
  readonly eventDate: IsoDate;
  readonly amount: Money;
  readonly state: AidState;
  readonly note: string | null;
  readonly requestedAt: IsoInstant;
  readonly decisionNote: string | null;
}

export interface DebtView {
  readonly debtId: string;
  readonly debtorMembershipId: string;
  readonly debtorName: string;
  readonly origin: "unpaid_obligation" | "fund_advance" | "unpaid_fine" | "catch_up";
  readonly amount: Money;
  readonly settled: Money;
  readonly remaining: Money;
  readonly state: "open" | "settled" | "written_off";
  readonly guarantorName: string | null;
  readonly createdAt: IsoInstant;
}

export interface OrderChangeView {
  readonly changeId: string;
  readonly kind: "swap" | "priority";
  readonly seqA: number;
  readonly seqB: number;
  readonly reason: string | null;
  readonly state: "requested" | "applied" | "rejected" | "cancelled";
  readonly requiredNames: readonly string[];
  readonly acceptedNames: readonly string[];
  readonly needsMyAcceptance: boolean;
}

export interface StatutesView {
  readonly version: number;
  readonly title: string;
  readonly body: string;
  readonly hash: string;
  readonly publishedAt: IsoInstant;
  readonly acceptedByMe: boolean;
  readonly acceptedCount: number;
}

export interface NotificationView {
  readonly notificationId: string;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly kind: string;
  readonly target: string | null;
  readonly createdAt: IsoInstant;
  readonly read: boolean;
}

/** Grille « qui a cotisé » d'un tour, filtrée selon la transparence du groupe. */
export interface RoundGridView {
  readonly seq: number;
  readonly transparency: Transparency;
  readonly rows: readonly {
    readonly membershipId: string | null;
    readonly displayName: string | null;
    readonly due: Money;
    readonly confirmed: Money;
    readonly declared: Money;
    readonly status: "paid" | "partial" | "declared" | "unpaid";
  }[];
  readonly summary: { readonly paid: number; readonly partial: number; readonly unpaid: number; readonly total: number };
}

export interface JournalEntryView {
  readonly seq: number;
  readonly type: string;
  readonly at: IsoInstant;
  readonly actorName: string | null;
  readonly summary: string;
  readonly hash: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
