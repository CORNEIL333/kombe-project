/* KÓMBE CRM — client typé des routes /v1/crm/* (ADR-0046). Le serveur décide
   (fonction d'opérateur, second facteur, RLS) ; ce client ne fabrique rien. */
import type { ApiClient } from '@kombe/dashboard-core';
import { encodePath } from '@kombe/dashboard-core';

export const CATEGORIES = ['connexion', 'cotisation', 'remise', 'amende', 'statuts', 'application', 'donnees_personnelles', 'reclamation', 'autre'] as const;
export type Categorie = (typeof CATEGORIES)[number];
export const STATUTS = ['nouveau', 'en_cours', 'attente_membre', 'resolu', 'ferme'] as const;
export type Statut = (typeof STATUTS)[number];
export type Canal = 'application' | 'telephone' | 'email' | 'whatsapp' | 'sur_place';

export const LIBELLE_CATEGORIE: Readonly<Record<Categorie, string>> = {
  connexion: 'Connexion',
  cotisation: 'Cotisation',
  remise: 'Remise de la cagnotte',
  amende: 'Amende',
  statuts: 'Statuts',
  application: 'Utilisation de l’application',
  donnees_personnelles: 'Données personnelles (droits)',
  reclamation: 'Réclamation',
  autre: 'Autre',
};
export const LIBELLE_STATUT: Readonly<Record<Statut, string>> = {
  nouveau: 'Nouvelle',
  en_cours: 'En cours',
  attente_membre: 'Attente du membre',
  resolu: 'Résolue',
  ferme: 'Close',
};
export const LIBELLE_CANAL: Readonly<Record<Canal, string>> = {
  application: 'Application',
  telephone: 'Téléphone',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  sur_place: 'Sur place',
};
/** Matrice ITIL : 1 = groupe entier ou plus, 2 = plusieurs membres, 3 = une personne. */
export const LIBELLE_IMPACT: Readonly<Record<number, string>> = { 1: 'Groupe entier ou plus', 2: 'Plusieurs membres', 3: 'Une personne' };
/** 1 = bloquant, 2 = gênant, 3 = question. */
export const LIBELLE_URGENCE: Readonly<Record<number, string>> = { 1: 'Bloquant', 2: 'Gênant', 3: 'Question' };
/** Délais de service par priorité (première réponse / résolution), identiques au déclencheur SQL. */
export const DELAIS: Readonly<Record<number, { readonly reponse: string; readonly resolution: string }>> = {
  1: { reponse: '1 h', resolution: '8 h' },
  2: { reponse: '4 h', resolution: '24 h' },
  3: { reponse: '8 h', resolution: '72 h' },
  4: { reponse: '24 h', resolution: '7 jours' },
};
/** Priorité calculée comme la base (kombe_crm_ticket_sla) : affichage seulement. */
export function priorite(impact: number, urgence: number): number {
  return Math.min(4, impact + urgence - 1);
}

export interface Ticket {
  readonly ticketId: string;
  readonly ref: string;
  readonly subject: string;
  readonly category: Categorie;
  readonly channel: Canal;
  readonly impact: number;
  readonly urgency: number;
  readonly priority: number;
  readonly status: Statut;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly requesterContactId: string | null;
  readonly requesterName: string | null;
  readonly assigneeContactId: string | null;
  readonly assigneeName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly firstResponseDue: string;
  readonly resolutionDue: string;
  readonly firstResponseAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly satisfaction: number | null;
  readonly satisfactionComment: string | null;
  readonly sla: { readonly firstResponseBreached: boolean; readonly resolutionBreached: boolean };
  readonly anonymized: boolean;
  readonly version: number;
}
export interface TicketMessage {
  readonly messageId: string;
  readonly authorKind: 'membre' | 'operateur' | 'systeme';
  readonly authorName: string | null;
  readonly visibility: 'public' | 'interne';
  readonly body: string;
  readonly createdAt: string;
}
export interface TicketDetail extends Ticket {
  readonly messages: readonly TicketMessage[];
}
export interface Dashboard {
  readonly tickets: {
    readonly byStatus: { readonly nouveau: number; readonly en_cours: number; readonly attente_membre: number; readonly resolus30j: number };
    readonly openByPriority: { readonly p1: number; readonly p2: number; readonly p3: number; readonly p4: number };
    readonly breaches: { readonly firstResponse: number; readonly resolution: number };
    readonly rightsRequestsOpen: number;
    readonly created7d: number;
    readonly mineOpen: number;
    readonly unassigned: number;
    readonly medianFirstResponseHours: number | null;
    readonly firstResponseOnTimePercent: number | null;
  };
  readonly satisfaction: { readonly average: number | null; readonly responses: number };
  readonly myTasks: { readonly open: number; readonly overdue: number };
}
export interface Account {
  readonly groupId: string;
  readonly name: string | null;
  readonly state: string;
  readonly createdAt: string | null;
  readonly membersActive: number;
  readonly membersPending: number;
  readonly movementsDeclaredPending: number;
  readonly oldestPendingAt: string | null;
  readonly openDebts: number;
  readonly lastActivityAt: string | null;
  readonly ticketsOpen: number;
  readonly ticketsTotal: number;
  readonly segments: readonly string[];
}
export interface Note {
  readonly noteId: string;
  readonly authorName: string | null;
  readonly body: string;
  readonly createdAt: string;
}
export interface TaskLite {
  readonly taskId: string;
  readonly title: string;
  readonly dueAt: string | null;
  readonly status: 'a_faire' | 'fait' | 'annule';
  readonly assigneeName: string | null;
  readonly version: number;
}
export interface AccountContact {
  readonly contactId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly membershipState: string;
  readonly loginMasked: string;
  readonly loginKind: 'email' | 'telephone';
}
export interface AccountDetail {
  readonly groupId: string;
  readonly name: string | null;
  readonly state: string;
  readonly createdAt: string | null;
  readonly health: {
    readonly membersActive: number;
    readonly membersPending: number;
    readonly movementsDeclaredPending: number;
    readonly oldestPendingAt: string | null;
    readonly openDebts: number;
    readonly lastActivityAt: string | null;
  };
  readonly segments: readonly string[];
  readonly contacts: readonly AccountContact[];
  readonly tickets: readonly Ticket[];
  readonly notes: readonly Note[];
  readonly tasks: readonly TaskLite[];
}
export interface ContactCard {
  readonly contactId: string;
  readonly displayName: string;
  readonly loginMasked: string;
  readonly loginKind: 'email' | 'telephone';
  readonly language: string;
  readonly createdAt: string | null;
  readonly isOperator: boolean;
  readonly groups: readonly { readonly groupId: string; readonly name: string | null; readonly state: string; readonly roles: readonly string[] }[];
  readonly consent: { readonly push: boolean; readonly sms: boolean; readonly email: boolean };
  readonly tickets: readonly Ticket[];
  readonly notes: readonly Note[];
  readonly tasks: readonly TaskLite[];
}
export interface Task extends TaskLite {
  readonly overdue: boolean;
  readonly assigneeContactId: string;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly contactId: string | null;
  readonly contactName: string | null;
  readonly ticketId: string | null;
  readonly ticketRef: string | null;
  readonly createdAt: string;
}
export interface Operator {
  readonly contactId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}
export interface Segment {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly count: number;
  readonly groups: readonly { readonly groupId: string; readonly name: string | null }[];
}
export interface AuditRow {
  readonly auditId: string;
  readonly at: string;
  readonly actorName: string | null;
  readonly actorContactId: string;
  readonly action: string;
  readonly objectKind: string;
  readonly objectId: string | null;
  readonly motif: string | null;
  readonly detail: unknown;
}
export interface Compliance {
  readonly processingRecords: readonly {
    readonly recordId: string;
    readonly purpose: string;
    readonly dataCategories: readonly string[];
    readonly legalBasis: string;
    readonly recipients: readonly string[];
    readonly country: string;
    readonly retentionDays: number;
  }[];
  readonly rightsRequestsOpen: readonly Ticket[];
  readonly retention: { readonly policyDays: number; readonly eligibleForAnonymization: number; readonly anonymizedTotal: number };
  readonly auditLast30Days: Readonly<Record<string, number>>;
}
export interface TicketFilters {
  readonly status?: string;
  readonly priority?: string;
  readonly assignee?: string;
  readonly category?: string;
  readonly groupId?: string;
  readonly q?: string;
}
export interface TicketCreate {
  readonly subject: string;
  readonly category: Categorie;
  readonly channel: Canal;
  readonly impact: number;
  readonly urgency: number;
  readonly groupId?: string;
  readonly contactId?: string;
  readonly body: string;
}
export interface TicketPatch {
  readonly status?: Statut;
  readonly impact?: number;
  readonly urgency?: number;
  readonly category?: Categorie;
  readonly assigneeContactId?: string | null;
  readonly groupId?: string | null;
}

const p = encodePath;
const json = { 'content-type': 'application/json' };

export class CrmApi {
  constructor(private readonly api: ApiClient) {}
  private patch<T>(path: string, body: unknown, version: number): Promise<T> {
    return this.api.request<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: { ...json, 'if-match-version': String(version) } });
  }
  dashboard(s?: AbortSignal) { return this.api.get<Dashboard>('/v1/crm/dashboard', undefined, s); }
  tickets(f: TicketFilters, s?: AbortSignal) { return this.api.get<Ticket[]>('/v1/crm/tickets', { ...f }, s); }
  ticket(id: string, s?: AbortSignal) { return this.api.get<TicketDetail>(`/v1/crm/tickets/${p(id)}`, undefined, s); }
  createTicket(b: TicketCreate) { return this.api.post<Ticket>('/v1/crm/tickets', b); }
  updateTicket(id: string, b: TicketPatch, version: number) { return this.patch<Ticket>(`/v1/crm/tickets/${p(id)}`, b, version); }
  addMessage(id: string, body: string, visibility: 'public' | 'interne') { return this.api.post<{ messageId: string }>(`/v1/crm/tickets/${p(id)}/messages`, { body, visibility }); }
  accounts(s?: AbortSignal) { return this.api.get<Account[]>('/v1/crm/accounts', undefined, s); }
  account(groupId: string, s?: AbortSignal) { return this.api.get<AccountDetail>(`/v1/crm/accounts/${p(groupId)}`, undefined, s); }
  searchContact(login: string) { return this.api.post<{ contactId: string }>('/v1/crm/contacts/search', { login }); }
  contact(id: string, s?: AbortSignal) { return this.api.get<ContactCard>(`/v1/crm/contacts/${p(id)}`, undefined, s); }
  reveal(id: string, motif: string) { return this.api.post<{ login: string }>(`/v1/crm/contacts/${p(id)}/reveal`, { motif }); }
  addNote(target: { groupId: string } | { contactId: string }, body: string) { return this.api.post<{ noteId: string }>('/v1/crm/notes', { ...target, body }); }
  tasks(scope: 'miennes' | 'toutes', status: 'ouvertes' | 'toutes', s?: AbortSignal) { return this.api.get<Task[]>('/v1/crm/tasks', { scope, status }, s); }
  createTask(b: { title: string; dueAt?: string; assigneeContactId?: string; groupId?: string; contactId?: string; ticketId?: string }) { return this.api.post<{ taskId: string }>('/v1/crm/tasks', b); }
  updateTask(id: string, status: 'a_faire' | 'fait' | 'annule', version: number) { return this.patch<{ taskId: string; status: string; version: number }>(`/v1/crm/tasks/${p(id)}`, { status }, version); }
  operators(s?: AbortSignal) { return this.api.get<Operator[]>('/v1/crm/operators', undefined, s); }
  segments(s?: AbortSignal) { return this.api.get<Segment[]>('/v1/crm/segments', undefined, s); }
  audit(f: { objectKind?: string; objectId?: string }, s?: AbortSignal) { return this.api.get<AuditRow[]>('/v1/crm/audit', { ...f }, s); }
  compliance(s?: AbortSignal) { return this.api.get<Compliance>('/v1/crm/compliance', undefined, s); }
  anonymize(olderThanDays: number) { return this.api.post<{ anonymized: number }>('/v1/crm/compliance/anonymize', { olderThanDays }); }
}
