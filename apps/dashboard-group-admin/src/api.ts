/* KÓMBE — client du tableau de bord « Espace bureau » : l'API tontine réelle
   (docs/API_TONTINE.md), vue depuis le bureau d'un groupe (président,
   secrétaire, trésorier, commissaire). Types partagés : @kombe/domain. */
import { ApiClient, encodePath } from '@kombe/dashboard-core';
import type {
  AidView, DebtView, DecisionView, SanctionView, DueView, FineView, InvitationView, JournalEntryView, MeetingDetail, MeetingSummary,
  MemberView, MovementView, RoundGridView, RoundView, StatutesView, TontineDetail, TontineSummary,
} from '@kombe/domain';

export type {
  AidView, DebtView, DecisionView, SanctionView, DueView, FineView, InvitationView, JournalEntryView, MeetingDetail, MeetingSummary,
  MemberView, MovementView, RoundGridView, RoundView, StatutesView, TontineDetail, TontineSummary,
};

function cle(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
const W = () => ({ 'idempotency-key': cle() });

export class GroupAdminApi {
  constructor(private readonly api: ApiClient) {}
  private t(id: string) { return `/v1/tontines/${encodePath(id)}`; }
  myTontines(s?: AbortSignal) { return this.api.get<TontineSummary[]>('/v1/me/tontines', undefined, s); }
  detail(id: string, s?: AbortSignal) { return this.api.get<TontineDetail>(this.t(id), undefined, s); }
  members(id: string, s?: AbortSignal) { return this.api.get<MemberView[]>(`${this.t(id)}/members`, undefined, s); }
  rounds(id: string, s?: AbortSignal) { return this.api.get<RoundView[]>(`${this.t(id)}/rounds`, undefined, s); }
  grid(id: string, seq: number, s?: AbortSignal) { return this.api.get<RoundGridView>(`${this.t(id)}/rounds/${seq}/grid`, undefined, s); }
  movements(id: string, q: { state?: string; fundId?: string; roundSeq?: number } = {}, s?: AbortSignal) {
    return this.api.get<MovementView[]>(`${this.t(id)}/movements`, { state: q.state, fundId: q.fundId, roundSeq: q.roundSeq }, s);
  }
  confirm(id: string, movementIds: string[]) { return this.api.post<MovementView[]>(`${this.t(id)}/movements/confirmations`, { movementIds }, W()); }
  control(id: string, mvid: string) { return this.api.post<MovementView>(`${this.t(id)}/movements/${encodePath(mvid)}/control`, {}, W()); }
  reject(id: string, mvid: string, reason: string) { return this.api.post<MovementView>(`${this.t(id)}/movements/${encodePath(mvid)}/rejection`, { reason }, W()); }
  meetings(id: string, s?: AbortSignal) { return this.api.get<MeetingSummary[]>(`${this.t(id)}/meetings`, undefined, s); }
  meeting(id: string, mid: string, s?: AbortSignal) { return this.api.get<MeetingDetail>(`${this.t(id)}/meetings/${encodePath(mid)}`, undefined, s); }
  approveMinutes(id: string, mid: string, hash: string) { return this.api.post<MeetingDetail>(`${this.t(id)}/meetings/${encodePath(mid)}/minutes-approval`, { hash }, W()); }
  admission(id: string, mid: string, decision: 'admit' | 'reject') { return this.api.post<MemberView>(`${this.t(id)}/members/${encodePath(mid)}/admission`, { decision }, W()); }
  invitations(id: string, s?: AbortSignal) { return this.api.get<InvitationView[]>(`${this.t(id)}/invitations`, undefined, s); }
  createInvitation(id: string) { return this.api.post<InvitationView>(`${this.t(id)}/invitations`, { maxUses: 30, days: 14 }, W()); }
  revokeInvitation(id: string, iid: string) { return this.api.post<void>(`${this.t(id)}/invitations/${encodePath(iid)}/revocation`, {}, W()); }
  fines(id: string, s?: AbortSignal) { return this.api.get<FineView[]>(`${this.t(id)}/fines`, undefined, s); }
  aids(id: string, s?: AbortSignal) { return this.api.get<AidView[]>(`${this.t(id)}/aids`, undefined, s); }
  debts(id: string, s?: AbortSignal) { return this.api.get<DebtView[]>(`${this.t(id)}/debts`, undefined, s); }
  decisions(id: string, s?: AbortSignal) { return this.api.get<DecisionView[]>(`${this.t(id)}/decisions`, undefined, s); }
  sanctions(id: string, s?: AbortSignal) { return this.api.get<SanctionView[]>(`${this.t(id)}/sanctions`, undefined, s); }
  closeDecision(id: string, did: string) { return this.api.post<DecisionView>(`${this.t(id)}/decisions/${encodePath(did)}/close`, {}, W()); }
  statutes(id: string, s?: AbortSignal) { return this.api.get<StatutesView>(`${this.t(id)}/statutes`, undefined, s); }
  journal(id: string, s?: AbortSignal) { return this.api.get<{ valid: boolean; entries: JournalEntryView[] }>(`${this.t(id)}/journal`, undefined, s); }
}

/** CSV (séparateur « ; », BOM UTF-8 pour Excel FR), montants entiers XAF. */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
