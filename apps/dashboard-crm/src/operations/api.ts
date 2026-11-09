import { ApiClient, encodePath } from '@kombe/dashboard-core';

export interface SupportAccessView { readonly requestId: string; readonly applicantIdentityId: string; readonly targetGroupId: string; readonly motif: string; readonly permissions: readonly string[]; readonly approverCount: number; readonly requiredApprovals: number; readonly requestedAt: number; readonly expiresAt: number | null; readonly status: 'pending_approval' | 'granted' | 'expired' | 'revoked'; readonly version: number }
export interface SupportQueueRow { readonly requestId: string; readonly applicantIdentityId: string; readonly targetGroupId: string; readonly targetGroupName: string | null; readonly motif: string; readonly permissions: readonly string[]; readonly approverCount: number; readonly requiredApprovals: number; readonly requestedAt: string; readonly expiresAt: string | null; readonly status: string; readonly version: number }
export interface OpsOverview {
  readonly groupsByState: Readonly<Record<string, number>>; readonly identities: number; readonly identitiesLast7d: number;
  readonly membershipsActive: number; readonly membershipsPending: number; readonly sessionsActive24h: number;
  readonly meetingsOpen: number; readonly meetingsNext7d: number; readonly meetingsClosedNoMinutesApproval: number;
  readonly movementsDeclared: number; readonly movementsDeclaredOver72h: number; readonly oldestDeclaredAt: string | null;
  readonly payoutsAwaitingReceipt: number; readonly finesContested: number; readonly aidsRequested: number; readonly debtsOpen: number;
  readonly outboxPending: number; readonly outboxDead: number; readonly outboxOldestPendingAt: string | null; readonly inboxLast24h: number;
  readonly supportRequestsPending: number; readonly securityEventsLast7d: number; readonly serverNow: string;
}
export interface OpsGroupRow { readonly groupId: string; readonly name: string | null; readonly state: string; readonly createdAt: string; readonly membersActive: number; readonly membersPending: number; readonly meetingsTotal: number; readonly meetingsClosed: number; readonly movementsDeclaredPending: number; readonly oldestPendingAt: string | null; readonly openDebts: number; readonly lastActivityAt: string | null }

function cle(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export class OperationsApi {
  constructor(private readonly api: ApiClient) {}
  me(s?: AbortSignal) { return this.api.get<{ identityId: string; operator: boolean }>('/v1/ops/me', undefined, s); }
  overview(s?: AbortSignal) { return this.api.get<OpsOverview>('/v1/ops/overview', undefined, s); }
  groups(s?: AbortSignal) { return this.api.get<OpsGroupRow[]>('/v1/ops/groups', { limit: 300 }, s); }
  supportQueue(s?: AbortSignal) { return this.api.get<SupportQueueRow[]>('/v1/ops/support-requests', { limit: 200 }, s); }
  health(s?: AbortSignal) { return this.api.get<Record<string, unknown>>('/v1/health', undefined, s); }
  ready(s?: AbortSignal) { return this.api.get<Record<string, unknown>>('/v1/health/ready', undefined, s); }
  createAccess(i: { requestId: string; targetGroupId: string; motif: string; permissions: readonly string[]; ttlSeconds: number }) { return this.api.post<SupportAccessView>('/v1/support/access-requests', i, { 'idempotency-key': cle() }); }
  approve(id: string, ttl: number, version: number) { return this.api.post<SupportAccessView>(`/v1/support/access-requests/${encodePath(id)}/approvals`, { ttlSeconds: ttl }, { 'if-match-version': String(version) }); }
  revoke(id: string, version: number) { return this.api.post<SupportAccessView>(`/v1/support/access-requests/${encodePath(id)}/revocations`, undefined, { 'if-match-version': String(version) }); }
}
