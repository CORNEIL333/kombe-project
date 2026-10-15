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
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
// 4) Application Android : si des APK sont posés dans telechargements/
//    (construits par packages/mobile/scripts/build-apk.*, jamais commités),
//    ils sont publiés sous /telecharger/ avec une page simple.
const apkDir = resolve(root, "telechargements");
const apks = existsSync(apkDir) ? readdirSync(apkDir).filter((f) => f.endsWith(".apk")).sort() : [];
if (apks.length) {
  const dl = resolve(out, "telecharger");
  mkdirSync(dl, { recursive: true });
  const libelle = (f) =>
    f.includes("armv7") ? "Téléphones anciens ou d'entrée de gamme (32 bits)" : f.includes("arm64") ? "La plupart des téléphones (recommandé)" : "Tous les téléphones";
  const lignes = apks
    .map((f) => {
      cpSync(resolve(apkDir, f), resolve(dl, f));
      const mo = Math.round(statSync(resolve(apkDir, f)).size / 1e6);
      return `<li><a class="b" href="/telecharger/${f}" download>${libelle(f)}</a><small>${f} · ${mo} Mo</small></li>`;
    })
    .join("\n");
  writeFileSync(
    resolve(dl, "index.html"),
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Télécharger KÓMBE pour Android</title>
<style>body{margin:0;font-family:Manrope,system-ui,sans-serif;background:#061F1B;color:#F3ECDD;line-height:1.55}
.scene{position:relative;min-height:46vh;display:flex;align-items:flex-end;background:#082C26 url(/brand/photos/mains-telephone.webp) center/cover}
.scene:before{content:"";position:absolute;top:0;right:0;bottom:0;left:0;background:linear-gradient(180deg,rgba(6,31,27,.25),rgba(6,31,27,.97))}
.scene div{position:relative;max-width:32rem;margin:0 auto;padding:2rem 1.25rem 1rem;width:100%;box-sizing:border-box}
.logo{display:inline-flex;align-items:center;font-weight:800;letter-spacing:.06em;font-size:22px;color:#FBF8F1}
h1{font-size:2rem;line-height:1.08;letter-spacing:-.03em;margin:1.4rem 0 .4rem;color:#FBF8F1}h1 em{display:block;font-family:Newsreader,Georgia,serif;font-weight:400;color:#E2B868}
main{max-width:32rem;margin:0 auto;padding:.5rem 1.25rem 2.5rem}ul{list-style:none;padding:0}li{margin:1rem 0}
a.b{display:block;padding:1rem 1.25rem;border-radius:999px;background:#E2B868;color:#13211C;font-weight:800;text-decoration:none;text-align:center}
small{display:block;text-align:center;opacity:.72;margin-top:.35rem}ol{padding-left:1.25rem}h2{font-size:1.15rem}</style></head>
<body><header class="scene"><div><span class="logo" role="img" aria-label="KÓMBE">K<svg width="21" height="21" viewBox="0 0 40 40" aria-hidden="true" style="margin:0 .04em"><circle cx="20" cy="22" r="13" fill="none" stroke="currentColor" stroke-width="4.5"/><path d="M23.5 3.5 L30 1" stroke="#C7922E" stroke-width="4.5" stroke-linecap="round"/></svg>MBE</span>
<h1>KÓMBE pour Android <em>votre tontine, plus claire.</em></h1><p>Le registre de votre tontine. KÓMBE ne garde pas votre argent.</p></div></header><main>
<ul>${lignes}</ul>
<h2>Installer</h2><ol><li>Touchez le bouton, puis ouvrez le fichier téléchargé.</li><li>Autorisez « Installer des applications inconnues » si le téléphone le demande.</li><li>Connectez-vous avec votre adresse e-mail et le code reçu.</li></ol>
<p>« Application non compatible » ? Prenez l'autre bouton. Pas d'Android ? Utilisez <a href="/" style="color:#E2B868">kombe.vercel.app</a> dans le navigateur.</p></main></body></html>\n`,
  );
}

process.stdout.write(`dist-web prêt : / ${APPS.map((a) => a.base).join(" ")} · apiBaseUrl=${config.apiBaseUrl}\n`);
