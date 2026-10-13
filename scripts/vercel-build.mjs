#!/usr/bin/env node
// KÓMBE — commande de build du projet Vercel unique (API + web).
//
// 1. compile le domaine et l'API (fonction serverless api/serverless.js) ;
// 2. assemble le web (PWA + 4 tableaux de bord + site) dans dist-web/ ;
// 3. si KOMBE_MIGRATION_DATABASE_URL est posée ET qu'il s'agit du déploiement
//    de PRODUCTION (VERCEL_ENV=production), applique les migrations manquantes
//    avec le vrai runner (idempotent, verrou advisory, une transaction par
//    fichier). Un aperçu (preview) ne touche JAMAIS la base de production.
//
// Échec d'une étape ⇒ build rouge ⇒ rien n'est mis en ligne.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function step(title, cmd, args, env = process.env) {
  process.stdout.write(`\n▶ ${title}\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env });
  if (r.status !== 0) {
    process.stderr.write(`✖ ${title} : échec (code ${r.status})\n`);
    process.exit(r.status ?? 1);
  }
}

step("Compilation domaine + API", "pnpm", ["--filter", "@kombe/api...", "run", "build"]);
step("Assemblage du web (PWA + tableaux de bord)", process.execPath, ["scripts/build-web.mjs"]);

const migrationUrl = process.env.KOMBE_MIGRATION_DATABASE_URL;
const isProd = (process.env.VERCEL_ENV ?? "production") === "production";
if (migrationUrl && isProd) {
  step("Migrations de la base de production", process.execPath, ["packages/db/scripts/migrate.mjs", "migrate"], {
    ...process.env,
    KOMBE_DATABASE_URL: migrationUrl,
  });
} else {
  process.stdout.write(
    migrationUrl
      ? "\nℹ Aperçu (VERCEL_ENV≠production) : migrations NON appliquées.\n"
      : "\nℹ KOMBE_MIGRATION_DATABASE_URL absente : migrations à lancer à la main (DEPLOY.md).\n",
  );
}
process.stdout.write("\n✔ Build KÓMBE terminé.\n");
