/**
 * Client typé des routes « tontine réelle » (packages/api/src/tontine/routes.ts).
 * Identité = session Bearer portée par l'ApiClient de @kombe/dashboard-core ;
 * le groupe est toujours dans le chemin ; jamais d'en-tête x-actor. Les
 * montants partent en chaînes d'entiers XAF ("10000"), acceptées par le schéma
 * zod du serveur.
 */
import { encodePath, type ApiClient } from '@kombe/dashboard-core';
import type {
  Aid,
  AidDecisionInput,
  AidEvent,
  AttendanceEntry,
  CloseInput,
  CollectionItem,
  CreatedInvitation,
  Debt,
  DebtOrigin,
  Fine,
  Fund,
  GroupOverview,
  GroupRole,
  ImportResult,
  Invitation,
  IssueFineInput,
  LegacyContribution,
  LegacyNjangi,
  MeetingDetail,
  MeetingRow,
  Member,
  Movement,
  MovementFilter,
  MovementState,
  MyGroup,
  OrderChange,
  PaymentChannel,
  PayoutInput,
  RegularityRow,
  RoleAssignment,
  Schedule,
  Statutes,
} from './types';

export class TontineApi {
  constructor(private readonly api: ApiClient) {}

  private g(groupId: string, rest = ''): string {
    return `/v1/groups/${encodePath(groupId)}${rest}`;
  }
  private send<T>(method: 'PUT' | 'PATCH', path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.api.request<T>(path, { method, body: JSON.stringify(body) }, signal);
  }

  /* Identité */
  myGroups(signal?: AbortSignal) {
    return this.api.get<readonly MyGroup[]>('/v1/me/groups', undefined, signal);
  }
  /** Identifiant normalisé par le serveur (« +237690000001 »), utile pour les accords d'échange de tours. */
  profile(signal?: AbortSignal) {
    return this.api.get<{ identityId: string; displayName: string | null; language: 'fr' | 'en' | 'pcm' }>('/v1/me/profile', undefined, signal);
  }

  /* Groupe et membres */
  overview(groupId: string, signal?: AbortSignal) {
    return this.api.get<GroupOverview>(this.g(groupId, '/overview'), undefined, signal);
  }
  members(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly Member[]>(this.g(groupId, '/members'), undefined, signal);
  }
  decideMembership(groupId: string, membershipId: string, decision: 'admit' | 'refuse') {
    return this.api.post<{ state: string }>(this.g(groupId, `/memberships/${encodePath(membershipId)}/decisions`), { decision });
  }

  /* Invitations par code */
  invitations(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly Invitation[]>(this.g(groupId, '/invitations'), undefined, signal);
  }
  createInvitation(groupId: string, input: { maxUses: number; ttlHours: number; channel: 'link' | 'whatsapp' }) {
    return this.api.post<CreatedInvitation>(this.g(groupId, '/invitations'), input);
  }
  revokeInvitation(groupId: string, invitationId: string) {
    return this.api.post<null>(this.g(groupId, `/invitations/${encodePath(invitationId)}/revocations`));
  }

  /* Bureau */
  roles(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly RoleAssignment[]>(this.g(groupId, '/roles'), undefined, signal);
  }
  proposeRole(groupId: string, input: { membershipId: string; role: Exclude<GroupRole, 'member'>; mandateStart: string; mandateEnd: string | null }) {
    return this.api.post<{ roleAssignmentId: string }>(this.g(groupId, '/roles'), input);
  }
  acceptRole(groupId: string, roleAssignmentId: string) {
    return this.api.post<null>(this.g(groupId, `/roles/${encodePath(roleAssignmentId)}/acceptances`));
  }
  endRole(groupId: string, roleAssignmentId: string, reason: string) {
    return this.api.post<null>(this.g(groupId, `/roles/${encodePath(roleAssignmentId)}/end`), { reason });
  }

  /* Calendrier et échanges de tours */
  schedule(groupId: string, signal?: AbortSignal) {
    return this.api.get<Schedule>(this.g(groupId, '/tontine-schedule'), undefined, signal);
  }
  orderChanges(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly OrderChange[]>(this.g(groupId, '/order-changes'), undefined, signal);
  }
  actOnOrderChange(groupId: string, changeId: string, act: 'accept' | 'approve' | 'reject') {
    return this.api.post<{ state: string }>(this.g(groupId, `/order-changes/${encodePath(changeId)}/${act}`));
  }

  /* File à valider, caisses, mouvements */
  pendingValidations(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly Movement[]>(this.g(groupId, '/pending-validations'), undefined, signal);
  }
  funds(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly Fund[]>(this.g(groupId, '/funds'), undefined, signal);
  }
  movements(groupId: string, filter: MovementFilter = {}, signal?: AbortSignal) {
    const query = {
      state: filter.state,
      fundId: filter.fundId,
      meetingId: filter.meetingId,
      mine: filter.mine === undefined ? undefined : String(filter.mine),
    };
    return this.api.get<readonly Movement[]>(this.g(groupId, '/movements'), query, signal);
  }
  confirmMovement(groupId: string, movementId: string) {
    return this.api.post<{ state: MovementState }>(this.g(groupId, `/movements/${encodePath(movementId)}/confirmations`));
  }
  controlMovement(groupId: string, movementId: string) {
    return this.api.post<{ state: MovementState }>(this.g(groupId, `/movements/${encodePath(movementId)}/controls`));
  }
  rejectMovement(groupId: string, movementId: string, reason: string) {
    return this.api.post<{ state: MovementState }>(this.g(groupId, `/movements/${encodePath(movementId)}/rejections`), { reason });
  }
  confirmMovements(groupId: string, movementIds: readonly string[]) {
    return this.api.post<Readonly<Record<string, MovementState>>>(this.g(groupId, '/movements/confirmations'), { movementIds });
  }

  /* Séances */
  meetings(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly MeetingRow[]>(this.g(groupId, '/meetings'), undefined, signal);
  }
  meeting(groupId: string, meetingId: string, signal?: AbortSignal) {
    return this.api.get<MeetingDetail>(this.g(groupId, `/meetings/${encodePath(meetingId)}`), undefined, signal);
  }
  openMeeting(groupId: string, meetingId: string) {
    return this.api.post<{ state: string }>(this.g(groupId, `/meetings/${encodePath(meetingId)}/open`));
  }
  cancelMeeting(groupId: string, meetingId: string, reason: string) {
    return this.api.post<{ state: string }>(this.g(groupId, `/meetings/${encodePath(meetingId)}/cancel`), { reason });
  }
  recordAttendance(groupId: string, meetingId: string, entries: readonly AttendanceEntry[]) {
    return this.send<{ present: number; absent: number; excused: number }>('PUT', this.g(groupId, `/meetings/${encodePath(meetingId)}/attendance`), { entries });
  }
  collect(groupId: string, meetingId: string, items: readonly CollectionItem[]) {
    return this.api.post<{ movementIds: string[] }>(this.g(groupId, `/meetings/${encodePath(meetingId)}/collections`), { items });
  }
  recordPayout(groupId: string, meetingId: string, input: PayoutInput) {
    return this.api.post<{ movementIds: string[] }>(this.g(groupId, `/meetings/${encodePath(meetingId)}/payouts`), input);
  }
  closeMeeting(groupId: string, meetingId: string, input: CloseInput) {
    return this.api.post<{ minutesHash: string; finesIssued: number }>(this.g(groupId, `/meetings/${encodePath(meetingId)}/close`), input);
  }
  approveMinutes(groupId: string, meetingId: string, hash: string, inMeetingId: string | null) {
    return this.api.post<null>(this.g(groupId, `/meetings/${encodePath(meetingId)}/minutes-approval`), { hash, inMeetingId });
  }
  shareText(groupId: string, meetingId: string, signal?: AbortSignal) {
    return this.api.get<{ text: string }>(this.g(groupId, `/meetings/${encodePath(meetingId)}/share-text`), undefined, signal);
  }

  /* Amendes */
  fines(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly Fine[]>(this.g(groupId, '/fines'), undefined, signal);
  }
  issueFine(groupId: string, input: IssueFineInput) {
    return this.api.post<{ fineId: string; amount: string }>(this.g(groupId, '/fines'), input);
  }
  actOnFine(groupId: string, fineId: string, act: 'contest' | 'uphold' | 'cancel', reason: string) {
    return this.api.post<{ state: string }>(this.g(groupId, `/fines/${encodePath(fineId)}/${act}`), { reason });
  }

  /* Secours */
  aids(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly Aid[]>(this.g(groupId, '/aids'), undefined, signal);
  }
  requestAid(groupId: string, input: { beneficiaryMembershipId: string; event: AidEvent; eventDate: string; note: string | null }) {
    return this.api.post<{ aidId: string; amount: string }>(this.g(groupId, '/aids'), input);
  }
  decideAid(groupId: string, aidId: string, input: AidDecisionInput) {
    return this.api.post<{ state: string; amount: string }>(this.g(groupId, `/aids/${encodePath(aidId)}/decisions`), input);
  }
  payAid(groupId: string, aidId: string, input: { channel: PaymentChannel; reference?: string | null; justification?: string | null }) {
    return this.api.post<{ movementId: string }>(this.g(groupId, `/aids/${encodePath(aidId)}/payments`), input);
  }

  /* Dettes */
  debts(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly Debt[]>(this.g(groupId, '/debts'), undefined, signal);
  }
  openDebt(groupId: string, input: { debtorMembershipId: string; origin: DebtOrigin; amount: string; creditorFundId?: string | null; originRef?: string | null }) {
    return this.api.post<{ debtId: string }>(this.g(groupId, '/debts'), input);
  }
  writeOffDebt(groupId: string, debtId: string, reason: string) {
    return this.api.post<null>(this.g(groupId, `/debts/${encodePath(debtId)}/write-off`), { reason });
  }

  /* Régularité */
  regularity(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly RegularityRow[]>(this.g(groupId, '/regularity'), undefined, signal);
  }

  /* Statuts */
  statutes(groupId: string, signal?: AbortSignal) {
    return this.api.get<Statutes | null>(this.g(groupId, '/statutes'), undefined, signal);
  }
  publishStatutes(groupId: string) {
    return this.api.post<{ version: number; hash: string }>(this.g(groupId, '/statutes'));
  }
  acceptStatutes(groupId: string, version: number, hash: string) {
    return this.api.post<null>(this.g(groupId, `/statutes/${encodePath(String(version))}/acceptances`), { hash });
  }

  /* Reprise d'historique */
  importHistory(groupId: string, njangi: LegacyNjangi) {
    return this.api.post<ImportResult>(this.g(groupId, '/history-imports'), { njangi });
  }
  history(groupId: string, signal?: AbortSignal) {
    return this.api.get<readonly LegacyContribution[]>(this.g(groupId, '/history'), undefined, signal);
  }
}
