/**
 * Garde de vocabulaire : KÓMBE tient un registre, il ne détient pas l'argent
 * du groupe. Aucun mot de banque ou de portefeuille dans le Bureau.
 */
import { describe, expect, it } from 'vitest';

const FORBIDDEN: readonly RegExp[] = [
  /épargne/i,
  /\bsolde\b/i,
  /\bretraits?\b/i,
  /débitée?s?\b/i,
  /portefeuille/i,
  /\bwallet/i,
  /vos fonds sont protégés/i,
  /validée? par le serveur/i,
];

const sources = import.meta.glob(['./**/*.{ts,tsx,css}', '../index.html', '!./vocabulary.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('vocabulaire interdit', () => {
  it('inspecte bien les sources du Bureau', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(Object.keys(sources)).toContain('./bureau/seance.tsx');
  });

  it.each(FORBIDDEN.map((r) => [r.source, r] as const))('aucune occurrence de %s', (_name, pattern) => {
    const hits = Object.entries(sources).flatMap(([file, text]) =>
      text.split('\n').flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
