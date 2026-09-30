/** C13 : décisions pures ; aucune décision monétaire ni effet externe ici. */
import { canonicalHash, DomainError, type JournalEvent } from '@kombe/domain';

export interface OutboxMessage {
  readonly outboxId: string;
  readonly commandId: string;
  readonly topic: string;
  readonly idempotencyRef: JournalEvent['hash'];
  readonly payload: Readonly<Record<string, unknown>>;
}
export type PublishResult = { readonly status: 'published' } | { readonly status: 'blocked'; readonly reason: string };
/** Compatibilité : le vieux point d'entrée synchrone ne simule jamais un envoi. */
export function processOutbox(_message: OutboxMessage): PublishResult {
  return { status: 'blocked', reason: 'Utiliser PgOutboxWorker avec PostgreSQL et un canal sandbox.' };
}
export const LOCK_SCREEN_TEXT = 'Une nouvelle notification est disponible dans KÓMBE.';
export const LEASE_MS = 30_000;
export const PROVIDER_TIMEOUT_MS = 5_000;
export const ATTEMPTS_MAX = 5;
export const REPLAY_MAX = 3;
export type Channel = 'internal' | 'push';
export interface DispatchRights {
  readonly active: boolean;
  readonly externalEnabled: boolean;
  readonly suspended: boolean;
}
export function validClock(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) throw new DomainError('JOUR_INVALIDE', 'Horloge serveur invalide');
}
export function decideDispatch(rights: DispatchRights, channel: Channel, now: number, expiresAt: number): 'deliver' | 'suppressed' | 'expired' | 'deferred' {
  validClock(now);
  validClock(expiresAt);
  if (now >= expiresAt) return 'expired';
  if (!rights.active) return 'suppressed';
  if (channel === 'internal') return 'deliver';
  if (!rights.externalEnabled) return 'suppressed';
  return rights.suspended ? 'deferred' : 'deliver';
}
export function deliveryRef(key: { readonly eventRef: string; readonly recipient: string; readonly channel: string; readonly type: string }): string {
  return canonicalHash({ eventRef: key.eventRef, recipient: key.recipient, channel: key.channel, type: key.type });
}
export function retryDecision(attempt: number, max: number, now: number, jitter: number): { state: 'retry' | 'dead'; nextAt: number } {
  validClock(now);
  if (!Number.isSafeInteger(attempt) || attempt < 1 || !Number.isSafeInteger(max) || max < 1 || max > 5 || !Number.isFinite(jitter) || jitter < 0 || jitter >= 1) {
    throw new DomainError('RESERVATION_INCOHERENTE', 'Politique de reprise invalide');
  }
  if (attempt >= max) return { state: 'dead', nextAt: now };
  const ceiling = Math.min(60_000, 1_000 * 2 ** Math.min(attempt - 1, 10));
  return { state: 'retry', nextAt: now + Math.floor(ceiling / 2 + jitter * (ceiling / 2 + 1)) };
}
export interface ProviderRequest {
  readonly idempotencyRef: string;
  readonly recipient: string;
  readonly text: typeof LOCK_SCREEN_TEXT;
}
/** Aucun message d'erreur brut ou contenu financier n'entre dans ce contrat. */
export interface Provider {
  send(request: ProviderRequest, signal?: AbortSignal): Promise<{ status: 'accepted' | 'rejected' }>;
}
