// KÓMBE — publication locale d'une version mobile (sans GitHub Actions).
//
// Même résultat que .github/workflows/mobile-release.yml, exécuté depuis la
// machine qui détient la clé de signature des applications installées :
//   1. lit la version de packages/mobile/pubspec.yaml (X.Y.Z+BUILD) ;
//   2. s'arrête si la release mobile-vX.Y.Z-bBUILD existe déjà ;
//   3. flutter test, puis APK release par architecture ;
//   4. manifeste kombe-update.json (SHA-256, tailles, notes) ;
//   5. release GitHub versionnée + mise à jour de la release fixe
//      « mobile-latest » (adresse lue par les téléphones) ;
//   6. copie des APK dans telechargements/ (page /telecharger/ du site).
// Les releases d'un dépôt public sont gratuites : aucun minute Actions.
//
// Usage : node scripts/mobile/publier.mjs [--sans-tests] [--forcer-build] [--apres-push]
// Automatique : git config core.hooksPath .githooks  (le hook pre-push lance
// la publication en arrière-plan quand la version de pubspec.yaml change).
// Prérequis : flutter, gh (connecté), Node 22. Signature : android/key.properties
// s'il existe, sinon la clé debug de cette machine (celle des APK installés).
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const racine = resolve(import.meta.dirname, "../..");
const mobile = join(racine, "packages/mobile");
const args = new Set(process.argv.slice(2));
const api = process.env.KOMBE_API_BASE_URL ?? "https://kombe.vercel.app/v1";

function run(cmd, argv, opts = {}) {
  // Seul flutter (flutter.bat sous Windows) passe par le shell : gh et node
  // reçoivent leurs arguments tels quels (titres avec espaces et parenthèses).
  const r = spawnSync(cmd, argv, { stdio: "inherit", shell: process.platform === "win32" && cmd === "flutter", cwd: racine, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(" ")} → code ${r.status}`);
}
function gh(argv, opts = {}) {
  return spawnSync("gh", argv, { encoding: "utf8", cwd: racine, ...opts });
}

const m = readFileSync(join(mobile, "pubspec.yaml"), "utf8").match(/^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$/m);
if (!m) throw new Error("version introuvable dans pubspec.yaml");
const [, version, build] = m;
const tag = `mobile-v${version}-b${build}`;
const depot = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], { encoding: "utf8", cwd: racine }).trim();
console.log(`▶ KÓMBE mobile ${version} (build ${build}) → ${depot} · ${tag}`);

// Commit publié : celui de HEAD, qui doit déjà être sur GitHub (le tag y pointe).
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: racine }).trim();
const branche = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", cwd: racine }).trim();
function surGitHub() {
  const r = spawnSync("git", ["ls-remote", "origin", `refs/heads/${branche}`], { encoding: "utf8", cwd: racine });
  return r.status === 0 && r.stdout.startsWith(sha);
}
if (args.has("--apres-push")) {
  // Lancé par le hook pre-push : attendre que le push soit arrivé (≤ 3 min).
  const fin = Date.now() + 180_000;
  while (!surGitHub()) {
    if (Date.now() > fin) throw new Error("le commit n'est pas arrivé sur GitHub : publication abandonnée");
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{},5000)"]);
  }
} else if (!surGitHub()) {
  throw new Error(`HEAD (${sha.slice(0, 7)}) n'est pas encore sur origin/${branche} : poussez d'abord (git push).`);
}

if (gh(["release", "view", tag]).status === 0) {
  console.log(`✓ ${tag} déjà publiée : augmentez le build dans pubspec.yaml pour diffuser une mise à jour.`);
  process.exit(0);
}

if (!args.has("--sans-tests")) run("flutter", ["test"], { cwd: mobile });
if (!args.has("--forcer-build") && existsSync(join(mobile, "build/app/outputs/flutter-apk/.kombe-build")) &&
    readFileSync(join(mobile, "build/app/outputs/flutter-apk/.kombe-build"), "utf8") === `${version}+${build}|${api}`) {
  console.log("✓ APK déjà construits pour cette version");
} else {
  run("flutter", ["build", "apk", "--release", "--split-per-abi", `--dart-define=KOMBE_API_BASE_URL=${api}`], { cwd: mobile });
  writeFileSync(join(mobile, "build/app/outputs/flutter-apk/.kombe-build"), `${version}+${build}|${api}`);
}

const dossier = join(tmpdir(), `kombe-release-${build}`);
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
const sortie = join(mobile, "build/app/outputs/flutter-apk");
const noms = { "app-arm64-v8a-release.apk": "kombe-arm64.apk", "app-armeabi-v7a-release.apk": "kombe-armv7.apk", "app-x86_64-release.apk": "kombe-x86_64.apk" };
for (const [src, dst] of Object.entries(noms)) copyFileSync(join(sortie, src), join(dossier, dst));

run("node", ["scripts/mobile/update-manifest.mjs", dossier, depot, tag, "packages/mobile/NOTES_VERSION.md"]);

const notes = readFileSync(join(mobile, "NOTES_VERSION.md"), "utf8").split(/^##\s/m)[1] ?? "";
const fichierNotes = join(dossier, "notes.md");
writeFileSync(fichierNotes, `## ${notes}`);
const fichiers = [...Object.values(noms), "kombe-update.json"].map((f) => join(dossier, f));

run("gh", ["release", "create", tag, ...fichiers, "--target", sha, "--title", `KÓMBE mobile ${version} (build ${build})`, "--notes-file", fichierNotes, "--latest=false"]);
if (gh(["release", "view", "mobile-latest"]).status !== 0) {
  run("gh", ["release", "create", "mobile-latest", "--title", "KÓMBE mobile — dernière version", "--notes",
    "Adresse stable de la dernière version publiée (manifeste de mise à jour directe et APK).", "--latest=false"]);
}
run("gh", ["release", "upload", "mobile-latest", ...fichiers, "--clobber"]);

const tele = join(racine, "telechargements");
mkdirSync(tele, { recursive: true });
copyFileSync(join(dossier, "kombe-arm64.apk"), join(tele, "kombe-arm64.apk"));
copyFileSync(join(dossier, "kombe-armv7.apk"), join(tele, "kombe-armv7.apk"));
copyFileSync(join(dossier, "kombe-update.json"), join(tele, "kombe-update.json"));
console.log(`✓ Publiée : https://github.com/${depot}/releases/tag/${tag}`);
console.log("  Les téléphones en 0.7.0+ la proposeront au prochain démarrage (au plus 12 h).");
console.log("  Pensez à redéployer le site si la page /telecharger/ doit servir ces APK.");
