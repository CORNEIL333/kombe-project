/**
 * Mise en forme et vocabulaire du Bureau. Les montants restent des entiers
 * XAF en chaînes (BigInt, jamais Number) ; affichage « 50 000 FCFA ».
 * Vocabulaire de validation : Déclarée → Confirmée par le trésorier → Validée.
 */
import type {
  AidEvent,
  AttendanceStatus,
  DebtOrigin,
  FineKind,
  MeetingState,
  MovementState,
  PaymentChannel,
} from './types';

const DIGITS = /^-?\d+$/;

/** « 50000 » → « 50 000 FCFA ». Valeur invalide → « — » (jamais de chiffre inventé). */
export function formatFcfa(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const raw = typeof value === 'bigint' ? value.toString() : String(value).trim();
  if (!DIGITS.test(raw)) return '—';
  const negative = raw.startsWith('-');
  const digits = BigInt(negative ? raw.slice(1) : raw).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '-' : ''}${grouped} FCFA`;
}

/** Saisie d'un montant : chiffres seulement (espaces tolérés), entier strictement positif. */
export function parseXafInput(input: string): string | null {
  const t = input.replace(/[\s  ]/g, '');
  if (!/^\d{1,10}$/.test(t)) return null;
  const n = BigInt(t);
  if (n <= 0n || n > 1_000_000_000n) return null;
  return n.toString();
}

/** Différence d'entiers XAF en chaînes (jamais négative). */
export function remainingXaf(due: string, declared: string): string {
  const d = BigInt(DIGITS.test(due) ? due : '0') - BigInt(DIGITS.test(declared) ? declared : '0');
  return d > 0n ? d.toString() : '0';
}

/** Date du jour ISO à Douala (UTC+1). */
export function todayDouala(nowMs = Date.now()): string {
  return new Date(nowMs + 3_600_000).toISOString().slice(0, 10);
}

/** « 2026-11-14 » ou horodatage → « 14/11/2026 ». */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-CM', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Douala' }).format(d);
}

/** Texte d'invitation à partager sur WhatsApp. */
export function invitationShareText(groupName: string, code: string): string {
  return `Rejoignez ${groupName} sur KÓMBE avec le code ${code}`;
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function shortHash(hash: string | null | undefined): string {
  return hash ? `${hash.slice(0, 12)}…` : '—';
}

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

export function movementStateLabel(state: MovementState, kind?: string): string {
  switch (state) {
    case 'declared':
      return 'Déclarée';
    case 'confirmed':
      return kind === 'payout' ? 'Réception confirmée par le bénéficiaire' : 'Confirmée par le trésorier';
    case 'validated':
      return 'Validée';
    case 'rejected':
      return 'Rejetée';
    case 'compensated':
      return 'Compensée';
  }
}
export function movementTone(state: MovementState): Tone {
  return state === 'validated' ? 'ok' : state === 'rejected' ? 'danger' : state === 'compensated' ? 'neutral' : 'warn';
}

export const MOVEMENT_KIND_LABELS: Readonly<Record<string, string>> = {
  contribution: 'Cotisation',
  payout: 'Remise',
  fine_payment: "Paiement d'amende",
  advance: 'Avance',
  advance_repayment: "Remboursement d'avance",
  transfer_in: 'Transfert reçu',
  transfer_out: 'Transfert émis',
  fee: 'Frais',
  expense: 'Dépense',
};

export const CHANNEL_LABELS: Readonly<Record<PaymentChannel, string>> = {
  cash: 'Espèces',
  orange_money: 'Orange Money',
  mtn_momo: 'MTN MoMo',
  bank: 'Banque',
  other: 'Autre',
};

export const ATTENDANCE_LABELS: Readonly<Record<AttendanceStatus, string>> = {
  present: 'Présent',
  late: 'En retard',
  excused: 'Excusé',
  absent: 'Absent',
  represented: 'Représenté',
};

export const MEETING_STATE_LABELS: Readonly<Record<MeetingState, string>> = {
  planned: 'Prévue',
  open: 'Ouverte',
  closed: 'Close',
  cancelled: 'Annulée',
};

export const FINE_KIND_LABELS: Readonly<Record<FineKind, string>> = {
  late_contribution: 'Retard de cotisation',
  meeting_late: 'Retard à la séance',
  meeting_absence: 'Absence non excusée',
  indiscipline: 'Indiscipline',
};
export const FINE_STATE_LABELS: Readonly<Record<string, string>> = {
  issued: 'Infligée',
  contested: 'Contestée',
  paid: 'Payée',
  cancelled: 'Annulée',
};

export const AID_EVENT_LABELS: Readonly<Record<AidEvent, string>> = {
  death_member: 'Décès du membre',
  death_spouse: 'Décès du conjoint',
  death_parent: "Décès d'un parent",
  death_child: "Décès d'un enfant",
  birth: 'Naissance',
  marriage: 'Mariage',
  illness: 'Maladie ou hospitalisation',
  other: 'Autre événement',
};
export const AID_STATE_LABELS: Readonly<Record<string, string>> = {
  requested: 'Demandé',
  approved: 'Approuvé',
  rejected: 'Refusé',
  paid: 'Versement déclaré et validé',
  cancelled: 'Annulé',
};

export const DEBT_ORIGIN_LABELS: Readonly<Record<DebtOrigin, string>> = {
  unpaid_obligation: 'Cotisation impayée',
  fund_advance: 'Avance de la caisse',
  unpaid_fine: 'Amende impayée',
  catch_up: 'Rattrapage',
};
export const DEBT_STATE_LABELS: Readonly<Record<string, string>> = {
  open: 'Ouverte',
  settled: 'Réglée',
  written_off: 'Abandonnée (motivée)',
};

export const FUND_KIND_LABELS: Readonly<Record<string, string>> = {
  rotation: 'Tontine (njangi)',
  solidarity: 'Caisse de secours',
  year_end_reserve: "Réserve de fin d'année",
  operating: 'Fonds de caisse',
  fines: 'Caisse des amendes',
  loan: 'Caisse de prêts (registre)',
  collector: 'Collecte par un tontinier',
};

export const ORDER_CHANGE_STATE_LABELS: Readonly<Record<string, string>> = {
  requested: 'En attente',
  applied: 'Appliqué',
  rejected: 'Refusé',
};

export const GROUP_STATE_LABELS: Readonly<Record<string, string>> = {
  configuration: 'En configuration',
  active: 'Actif',
  paused: 'En pause',
  closed: 'Clos',
  stopped_with_discrepancies: 'Arrêté avec écarts',
  archived: 'Archivé',
};

export const SCHEDULE_STATE_LABELS: Readonly<Record<string, string>> = {
  none: 'Aucun calendrier',
  draft: 'Brouillon (modifiable)',
  started: 'Démarré (figé)',
};

export function label(map: Readonly<Record<string, string>>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? key;
}
