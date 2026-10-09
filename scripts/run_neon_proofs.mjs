// Orchestrateur local des preuves base réelle Neon (s'exécute contre la base
// JETABLE résolue par --env-file=.env ; la garde guard.mjs refuse production).
// Chaque preuve fait un teardown/rebuild complet du schéma → on les lance en
// SÉRIE (une seule base partagée). N'IMPRIME que le verdict, jamais de faux PASS.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const apiTest = resolve(root, 'packages/api/test');
const files = readdirSync(apiTest).filter((f) => f.endsWith('.proof.mjs')).sort();

let worst = 0;
const rows = [];
for (const f of files) {
  const r = spawnSync('node', ['--env-file=.env', resolve(apiTest, f)], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  let status = 'NO_JSON';
  const m = out.match(/"status":\s*"(\w+)"/);
  if (m) status = m[1];
  const code = r.status;
  if (code > worst) worst = code;
  rows.push({ file: f, exit: code, status });
  process.stdout.write(`${f.padEnd(32)} exit=${code} status=${status}\n`);
}
process.stdout.write(`\nSUITE: ${rows.length} preuves · exit max=${worst}\n`);
process.exit(worst);
