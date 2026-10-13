#!/usr/bin/env node
// KÓMBE — assemble TOUT le web en un seul site statique, servi à la même
// origine que l'API (un seul projet Vercel, aucun CORS, aucune URL collée au
// build) :
//
//   /              PWA (membres)           packages/client
//   /bureau/       Espace bureau           apps/dashboard-group-admin
//   /ops/          Opérations & Support    apps/dashboard-operations
//   /direction/    Direction & Analytics   apps/dashboard-direction
//   /engineering/  Engineering             apps/dashboard-engineering
//   /site/         Site de présentation    apps/site
//   /v1/*          API (fonction serverless, voir vercel.json)
//
// `kombe-dashboard-config.json` est écrit UNE fois à la racine avec
// `apiBaseUrl: "/"` (même origine) ; KOMBE_WEB_API_BASE_URL permet de viser
// une API hébergée ailleurs. Sortie : dist-web/. Code de sortie ≠ 0 si un
// seul build échoue.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist-web");

const APPS = [
  { dir: "apps/dashboard-group-admin", base: "/bureau/" },
  { dir: "apps/dashboard-operations", base: "/ops/" },
  { dir: "apps/dashboard-direction", base: "/direction/" },
  { dir: "apps/dashboard-engineering", base: "/engineering/" },
  { dir: "apps/site", base: "/site/" },
];

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    process.stderr.write(`ÉCHEC : ${cmd} ${args.join(" ")} (dans ${cwd})\n`);
    process.exit(r.status ?? 1);
  }
}

const vite = (dir) => resolve(root, dir, "node_modules/vite/bin/vite.js");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1) PWA à la racine.
run(process.execPath, [vite("packages/client"), "build", "--outDir", out, "--emptyOutDir"], resolve(root, "packages/client"));

// 2) Tableaux de bord et site, chacun sous son préfixe.
for (const app of APPS) {
  if (!existsSync(resolve(root, app.dir, "package.json"))) continue;
  const dest = resolve(out, app.base.replace(/^\/|\/$/g, ""));
  run(process.execPath, [vite(app.dir), "build", "--base", app.base, "--outDir", dest, "--emptyOutDir"], resolve(root, app.dir));
  // La configuration se lit à la racine (/kombe-dashboard-config.json) : pas de copie locale trompeuse.
  for (const f of ["kombe-dashboard-config.json", "kombe-dashboard-config.example.json"]) rmSync(resolve(dest, f), { force: true });
  // Les images de marque référencées en absolu (/brand/…) existent déjà à la racine (PWA).
  if (existsSync(resolve(dest, "brand")) && !existsSync(resolve(out, "brand"))) cpSync(resolve(dest, "brand"), resolve(out, "brand"), { recursive: true });
}

// 3) Configuration unique, même origine par défaut.
const config = {
  apiBaseUrl: process.env.KOMBE_WEB_API_BASE_URL || "/",
  environment: process.env.VERCEL_ENV || process.env.KOMBE_ENVIRONMENT || "production",
};
writeFileSync(resolve(out, "kombe-dashboard-config.json"), JSON.stringify(config) + "\n");
process.stdout.write(`dist-web prêt : / ${APPS.map((a) => a.base).join(" ")} · apiBaseUrl=${config.apiBaseUrl}\n`);
