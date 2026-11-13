/* A17 — Espace bureau en anglais : chaque texte français de App.tsx a sa
   version anglaise (catalogue de l'espace ou du socle). On relit le source
   plutôt que de tenir une liste à la main. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_EN } from '@kombe/dashboard-core';
import { ENGLISH } from './english';

const src = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  // L('français', 'anglais') porte déjà sa traduction.
  .replace(/\bL\('(?:[^'\\]|\\.)*',\s*'(?:[^'\\]|\\.)*'\)/g, '')
  .replace(/`[^`]*`/g, '');
// Textes identiques en anglais (noms propres, sigles, techniques).
const MEMES = new Set(['@kombe/dashboard-core', 'Board space', 'Orange Money', 'MTN MoMo', 'WhatsApp', '&amp;', '&lt;', '&gt;', 'NFD', 'Date', 'Type', 'Code', 'Normal', 'Suggestion', 'Exclusion', 'Transparence', 'Abstention', 'Destitution', 'Votes & sanctions', 'Invitations', 'Votes', 'Sanctions']);

function textes(): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const t = (m[1] ?? '').replace(/\\'/g, "'");
    if (!/[A-Za-zÀ-ÿ]/.test(t)) continue;
    if (/^[a-z0-9_./:#-]*$/.test(t) || /^[a-z]+(_[a-z]+)+$/.test(t)) continue;
    if (t.startsWith('k-') || t.startsWith('/') || t.startsWith('#') || t.includes('kombe.')) continue;
    if (['ok', 'warn', 'danger', 'neutral', 'fr-FR', 'en-GB', 'Africa/Douala'].includes(t)) continue;
    out.push(t);
  }
  return [...new Set(out)];
}

describe('A17 — Espace bureau en anglais', () => {
  it('relit bien le source', () => expect(textes().length).toBeGreaterThan(200));
  it('chaque texte français a sa version anglaise', () => {
    const manquants = textes().filter((t) => !MEMES.has(t) && ENGLISH[t] === undefined && CORE_EN[t] === undefined);
    expect(manquants).toEqual([]);
  });
  it('aucun mot qui ferait croire que KÓMBE tient l’argent', () => {
    const interdits = /(?<!\p{L})(savings|balances?|withdrawals?|debited|secured?|guaranteed?)(?!\p{L})/iu;
    expect(Object.values(ENGLISH).filter((v) => interdits.test(v))).toEqual([]);
  });
});
