// Build explicite : le package worker ne possède pas encore de script pnpm.
import { spawnSync } from 'node:child_process';
const result = spawnSync('pnpm', ['--filter', '@kombe/api', 'exec', 'tsc', '--target','ES2023','--module','NodeNext','--moduleResolution','NodeNext','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--skipLibCheck','--declaration','--outDir','../worker/dist','../worker/src/outbox.ts','../worker/src/pgWorker.ts','../worker/src/simulator.ts'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
