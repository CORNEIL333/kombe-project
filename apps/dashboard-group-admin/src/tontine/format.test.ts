import { describe, expect, it } from 'vitest';
import { formatDay, formatFcfa, invitationShareText, movementStateLabel, parseXafInput, remainingXaf, shortHash, todayDouala, whatsappUrl } from './format';

describe('montants XAF', () => {
  it('« 50 000 FCFA » depuis la chaîne d’entier du serveur', () => {
    expect(formatFcfa('50000')).toBe('50 000 FCFA');
    expect(formatFcfa('0')).toBe('0 FCFA');
    expect(formatFcfa('1250000')).toBe('1 250 000 FCFA');
    expect(formatFcfa('-500')).toBe('-500 FCFA');
  });
  it('au-delà de Number.MAX_SAFE_INTEGER sans perte (BigInt)', () => {
    expect(formatFcfa('9007199254740993')).toBe('9 007 199 254 740 993 FCFA');
  });
  it('valeur absente ou invalide → « — », jamais un chiffre inventé', () => {
    expect(formatFcfa(undefined)).toBe('—');
    expect(formatFcfa(null)).toBe('—');
    expect(formatFcfa('12.5')).toBe('—');
    expect(formatFcfa('abc')).toBe('—');
  });
  it('saisie : entier positif, espaces tolérés, borné à 1 milliard', () => {
    expect(parseXafInput('10 000')).toBe('10000');
    expect(parseXafInput('0')).toBeNull();
    expect(parseXafInput('10,5')).toBeNull();
    expect(parseXafInput('1000000001')).toBeNull();
  });
  it('restant dû jamais négatif', () => {
    expect(remainingXaf('10000', '4000')).toBe('6000');
    expect(remainingXaf('10000', '12000')).toBe('0');
  });
});

describe('textes', () => {
  it('invitation WhatsApp exacte', () => {
    expect(invitationShareText('Njangi des Bamenda de Bonabéri', 'K7M2QX9P')).toBe('Rejoignez Njangi des Bamenda de Bonabéri sur KÓMBE avec le code K7M2QX9P');
    expect(whatsappUrl('a b')).toBe('https://wa.me/?text=a%20b');
  });
  it('vocabulaire de validation : Déclarée → Confirmée par le trésorier → Validée', () => {
    expect(movementStateLabel('declared')).toBe('Déclarée');
    expect(movementStateLabel('confirmed')).toBe('Confirmée par le trésorier');
    expect(movementStateLabel('validated')).toBe('Validée');
    expect(movementStateLabel('confirmed', 'payout')).toBe('Réception confirmée par le bénéficiaire');
  });
  it('dates', () => {
    expect(formatDay('2026-11-14')).toBe('14/11/2026');
    expect(formatDay('2026-11-14T00:00:00.000Z')).toBe('14/11/2026');
    expect(formatDay(null)).toBe('—');
    expect(todayDouala(Date.parse('2026-10-13T23:30:00Z'))).toBe('2026-10-14');
    expect(shortHash('a'.repeat(64))).toBe(`${'a'.repeat(12)}…`);
  });
});
