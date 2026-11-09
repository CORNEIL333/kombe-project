import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { mfaErrorMessage } from './OperatorGate';

const e = (status: number, code: string | null) => new ApiError('Requête refusée', status, null, code, null);

describe('mfaErrorMessage', () => {
  it('distingue limitation, code faux, facteur à vérifier et session expirée', () => {
    expect(mfaErrorMessage(e(429, 'AUTH_THROTTLED'))).toMatch(/Trop d’essais/);
    expect(mfaErrorMessage(e(400, 'TOKEN_INVALID'))).toMatch(/Code incorrect/);
    expect(mfaErrorMessage(e(403, 'OPERATOR_MFA_REQUIRED'))).toMatch(/déjà actif/);
    expect(mfaErrorMessage(e(401, 'SESSION_INVALID'))).toMatch(/reconnectez-vous/);
  });
  it('ne divulgue jamais un détail technique', () => {
    expect(mfaErrorMessage(new Error('ECONNRESET 10.0.0.1'))).not.toMatch(/ECONN|10\.0/);
  });
});
