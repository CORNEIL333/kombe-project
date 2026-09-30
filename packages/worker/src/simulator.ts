/** Frontière externe fictive : zéro réseau, zéro message réel. */
import { DomainError } from '@kombe/domain';
import { LOCK_SCREEN_TEXT, type Provider, type ProviderRequest } from './outbox.js';
export class Simulator implements Provider {
  private readonly accepted = new Set<string>();
  constructor(public mode: 'accept' | 'unavailable' | 'accepted_then_crash' = 'accept') {}
  get acceptedCount(): number { return this.accepted.size; }
  async send(request: ProviderRequest): Promise<{ status: 'accepted' | 'rejected' }> {
    if (request.text !== LOCK_SCREEN_TEXT || this.mode === 'unavailable') {
      throw new DomainError('CHANNEL_NOT_VERIFIED', 'Canal indisponible');
    }
    this.accepted.add(request.idempotencyRef);
    if (this.mode === 'accepted_then_crash') throw new DomainError('CHANNEL_NOT_VERIFIED', 'Réponse du canal inconnue');
    return { status: 'accepted' };
  }
}
