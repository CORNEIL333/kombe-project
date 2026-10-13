/**
 * Formes des réponses des routes « tontine réelle » (packages/api/src/tontine).
 * Les montants XAF sont des ENTIERS transmis en chaînes ("50000"), jamais des
 * nombres flottants. Certaines lignes sont renvoyées telles que lues en base
 * (snake_case) : les noms sont recopiés à l'identique du serveur.
 */
export const GROUP_ROLES = [
  'animator',
  'vice_president',
  'secretary',
  'treasurer',
  'treasurer_deputy',
  'auditor',
  'censor',
  'advisor',
  'member',
] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const PAYMENT_CHANNELS = ['cash', 'orange_money', 'mtn_momo', 'bank', 'other'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const ATTENDANCE_STATUSES = ['present', 'late', 'excused', 'absent', 'represented'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const FINE_KINDS = ['late_contribution', 'meeting_late', 'meeting_absence', 'indiscipline'] as const;
export type FineKind = (typeof FINE_KINDS)[number];

export const AID_EVENTS = ['death_member', 'death_spouse', 'death_parent', 'death_child', 'birth', 'marriage', 'illness', 'other'] as const;
export type AidEvent = (typeof AID_EVENTS)[number];

export const DEBT_ORIGINS = ['unpaid_obligation', 'fund_advance', 'unpaid_fine', 'catch_up'] as const;
export type DebtOrigin = (typeof DEBT_ORIGINS)[number];

export type MovementState = 'declared' | 'confirmed' | 'validated' | 'rejected' | 'compensated';
export type MeetingState = 'planned' | 'open' | 'closed' | 'cancelled';

/** Montant XAF entier en chaîne, tel que renvoyé par le serveur. */
export type Xaf = string;

export interface MyGroup {
  readonly groupId: string;
  readonly membershipId: string;
  readonly membershipState: string;
  readonly name: string | null;
  readonly groupState: string | null;
  readonly roles: readonly GroupRole[];
}

export interface FineScheduleView {
  readonly lateContributionFixed: Xaf;
  readonly lateContributionPerDay: Xaf;
  readonly lateContributionCap: Xaf;
  readonly meetingLate: Xaf;
  readonly meetingAbsence: Xaf;
  readonly indisciplineCap: Xaf;
  readonly graceDays: number;
}

export interface GroupSettingsView {
  readonly transparency: 'all_members' | 'bureau_only' | 'anonymized';
  readonly feeBearer: 'member' | 'beneficiary' | 'fund';
  readonly guarantorRequired: boolean;
  readonly newcomersLast: boolean;
  readonly minMembers: number;
  readonly maxMembers: number;
  readonly fines: FineScheduleView;
  readonly aidScale: readonly { readonly event: AidEvent; readonly amount: Xaf; readonly maxPerYear: number }[];
  readonly seat: string | null;
  readonly purpose: string | null;
  readonly meetingPlace: string | null;
  readonly minimumWitnesses: number;
}

export interface GroupOverview {
  readonly groupId: string;
  readonly name: string;
  readonly state: string;
  readonly settings: GroupSettingsView;
  readonly me: { readonly membershipId: string; readonly roles: readonly GroupRole[]; readonly displayName: string | null };
  readonly members: { readonly active: number; readonly pending: number };
  readonly schedule: { readonly state: string; readonly cadence: unknown; readonly cadenceLabel: string | null } | null;
  readonly nextMeeting: {
    readonly meeting_id: string;
    readonly seq: number;
    readonly scheduled_date: string;
    readonly state: MeetingState;
    readonly location: string | null;
  } | null;
  readonly pendingValidations: number;
}

export interface Member {
  readonly membershipId: string;
  readonly displayName: string;
  readonly state: 'active' | 'pending';
  readonly roles: readonly GroupRole[];
  readonly joinedAt: string | null;
  readonly sponsorMembershipId: string | null;
  readonly proxyMembershipId: string | null;
  readonly isMe: boolean;
  /** Visible du bureau seulement ; un numéro est masqué (« +237 6•• •• •• 03 »). */
  readonly contact: string | null;
}

export interface Invitation {
  readonly invitation_id: string;
  readonly code: string;
  readonly channel: 'link' | 'whatsapp';
  readonly max_uses: number;
  readonly used_count: number;
  readonly expires_at: string;
  readonly revoked_at: string | null;
}
export interface CreatedInvitation { readonly invitationId: string; readonly code: string; readonly expiresAt: string }

export interface RoleAssignment {
  readonly role_assignment_id: string;
  readonly membership_id: string;
  readonly display_name: string | null;
  readonly role: GroupRole;
  readonly accepted_at: string | null;
  readonly mandate_start: string | null;
  readonly mandate_end: string | null;
  readonly proposed: boolean;
}

export interface Holder { readonly membershipId: string; readonly name: string | null; readonly weight: number }
export interface Round {
  readonly seq: number;
  readonly roundId: string;
  readonly state: string;
  readonly date: string | null;
  readonly shareId: string | null;
  readonly holders: readonly Holder[];
  readonly meetingId: string | null;
}
export interface Schedule {
  readonly state: string;
  readonly cycleNo?: number;
  readonly cycleComplete?: boolean;
  readonly cadence?: unknown;
  readonly cadenceLabel?: string | null;
  readonly rulesVersion?: number;
  readonly contributionPerShare?: Xaf;
  readonly potPerRound?: Xaf;
  readonly startedAt?: string | null;
  readonly rounds: readonly Round[];
}

export interface OrderChange {
  readonly change_id: string;
  readonly kind: string;
  readonly seq_a: number;
  readonly seq_b: number;
  readonly reason: string | null;
  readonly required_identity_ids: readonly string[];
  readonly accepted_identity_ids: readonly string[];
  readonly approved: boolean;
  readonly state: 'requested' | 'applied' | 'rejected' | string;
  readonly created_at: string;
}

export interface Fund {
  readonly fundId: string;
  readonly kind: string;
  readonly name: string;
  readonly state: string;
  readonly rules: unknown;
  /** Écart du registre : ce qui est VALIDÉ entré moins validé sorti. KÓMBE ne détient rien. */
  readonly registerBalance: Xaf;
  readonly inProgressIn: Xaf;
  readonly inProgressOut: Xaf;
}

export interface Movement {
  readonly movementId: string;
  readonly fundId: string;
  readonly fundName: string;
  readonly fundKind: string;
  readonly kind: string;
  readonly amount: Xaf;
  readonly state: MovementState;
  readonly channel: PaymentChannel;
  readonly reference: string | null;
  readonly allegedDate: string | null;
  readonly declaredAt: string;
  readonly membershipId: string | null;
  readonly memberName: string | null;
  readonly meetingId: string | null;
  readonly relatedKind: string | null;
  readonly relatedId: string | null;
  readonly declaredByMe: boolean;
  readonly rejectedReason: string | null;
}
export interface MovementFilter {
  readonly state?: MovementState;
  readonly fundId?: string;
  readonly meetingId?: string;
  readonly mine?: boolean;
}

export interface MeetingRow {
  readonly meeting_id: string;
  readonly seq: number;
  readonly scheduled_date: string;
  readonly state: MeetingState;
  readonly location: string | null;
  readonly host_membership_id: string | null;
  readonly host_name: string | null;
  readonly round_seq: number | null;
  readonly minutes_hash: string | null;
  readonly minutes_approved_at: string | null;
}

export interface AttendanceRow {
  readonly membership_id: string;
  readonly display_name: string | null;
  readonly status: AttendanceStatus;
  readonly represented_by_membership_id: string | null;
}
export interface Due {
  readonly obligationId: string;
  readonly membershipId: string;
  readonly name: string | null;
  readonly due: Xaf;
  readonly declared: Xaf;
  readonly validated: Xaf;
}
export interface MeetingDetail {
  readonly meetingId: string;
  readonly seq: number;
  readonly scheduledDate: string;
  readonly state: MeetingState;
  readonly location: string | null;
  readonly hostMembershipId: string | null;
  readonly notes: string | null;
  readonly minutesText: string | null;
  readonly minutesHash: string | null;
  readonly minutesApprovedAt: string | null;
  readonly attendance: readonly AttendanceRow[];
  readonly round: { readonly round_id: string; readonly seq: number; readonly share_id: string | null; readonly holders: readonly Holder[] } | null;
  readonly pot: Xaf;
  readonly dues: readonly Due[];
}

export interface AttendanceEntry {
  readonly membershipId: string;
  readonly status: AttendanceStatus;
  readonly representedByMembershipId?: string | null;
}
export interface CollectionItem {
  readonly membershipId: string;
  readonly amount: Xaf;
  readonly channel: PaymentChannel;
  readonly reference?: string | null;
  readonly fundId?: string;
}
export interface PayoutInput {
  readonly channel: PaymentChannel;
  readonly reference?: string | null;
  readonly justification?: string | null;
  readonly witnessMembershipIds: readonly string[];
  readonly amount?: Xaf;
  readonly fee?: Xaf;
}
export interface CloseInput { readonly decisions: readonly string[]; readonly notes: string | null; readonly autoFines: boolean }

export interface Fine {
  readonly fine_id: string;
  readonly membership_id: string;
  readonly display_name: string | null;
  readonly kind: FineKind;
  readonly amount: Xaf;
  readonly reason: string;
  readonly state: 'issued' | 'contested' | 'paid' | 'cancelled';
  readonly issued_at: string;
  readonly meeting_id: string | null;
}
export interface IssueFineInput {
  readonly membershipId: string;
  readonly kind: FineKind;
  readonly amount?: Xaf | null;
  readonly reason: string;
  readonly meetingId?: string | null;
  readonly obligationId?: string | null;
}

export interface Aid {
  readonly aid_id: string;
  readonly beneficiary_membership_id: string;
  readonly display_name: string | null;
  readonly event: AidEvent;
  readonly event_date: string;
  readonly amount: Xaf;
  readonly state: 'requested' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  readonly requested_at: string;
  readonly decided_at: string | null;
}
export interface AidDecisionInput {
  readonly decision: 'approve' | 'reject';
  readonly overrideAmount?: Xaf | null;
  readonly overrideReason?: string | null;
  readonly note?: string | null;
}

export interface Debt {
  readonly debt_id: string;
  readonly debtor_membership_id: string;
  readonly display_name: string | null;
  readonly origin: DebtOrigin;
  readonly amount: Xaf;
  readonly settled: Xaf;
  readonly state: 'open' | 'settled' | 'written_off';
  readonly guarantor_membership_id: string | null;
  readonly guarantor_name: string | null;
  readonly created_at: string;
}

export interface RegularityRow {
  readonly membershipId: string;
  readonly name: string;
  readonly dueSoFar: number;
  readonly onTime: number;
  readonly late: number;
  readonly unpaidLate: number;
  readonly openFines: number;
  readonly onTimeRate: number;
  readonly badge: string;
  readonly isMe: boolean;
}

export interface Statutes {
  readonly version: number;
  readonly title: string;
  readonly body: string;
  readonly hash: string;
  readonly published_at: string;
  readonly accepted_by_me: boolean;
  readonly acceptances: number;
}

export interface LegacyNjangi {
  readonly id: string;
  readonly name: string;
  readonly members: readonly { readonly uid: string; readonly name: string; readonly phone?: string; readonly email?: string; readonly role?: string }[];
  readonly contributions: readonly { readonly id: string; readonly uid: string; readonly amount: number; readonly date: string; readonly status?: string }[];
}
export interface ImportResult {
  readonly importId: string;
  readonly accepted: number;
  readonly rejected: number;
  readonly report: readonly unknown[];
}
export interface LegacyContribution {
  readonly legacy_id: string;
  readonly legacy_member_name: string;
  readonly membership_id: string | null;
  readonly amount: Xaf;
  readonly contribution_date: string;
}
