// KÓMBE — manifeste de mise à jour directe de l'application mobile.
// Lit la version de packages/mobile/pubspec.yaml, calcule l'empreinte SHA-256
// et la taille de chaque APK, et écrit kombe-update.json (lu par l'app :
// packages/mobile/lib/core/update/kombe_update.dart).
//
// Usage : node scripts/mobile/update-manifest.mjs <dossier-apk> <dépôt owner/nom> <tag> [notes.md]
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [dir, repo, tag, notesFile] = process.argv.slice(2);
if (!dir || !repo || !tag) {
  console.error("Usage : update-manifest.mjs <dossier-apk> <owner/nom> <tag> [notes.md]");
  process.exit(2);
}
const pubspec = readFileSync("packages/mobile/pubspec.yaml", "utf8");
const m = pubspec.match(/^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$/m);
if (!m) throw new Error("version introuvable dans pubspec.yaml");
const [, version, build] = m;

const ABIS = { "arm64-v8a": "kombe-arm64.apk", "armeabi-v7a": "kombe-armv7.apk", x86_64: "kombe-x86_64.apk" };
const apks = {};
for (const [abi, name] of Object.entries(ABIS)) {
  const file = join(dir, name);
  if (!existsSync(file)) continue;
  const bytes = readFileSync(file);
  apks[abi] = {
    url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${name}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: statSync(file).size,
  };
}
if (Object.keys(apks).length === 0) throw new Error(`aucun APK dans ${dir}`);

// Notes : lignes « - … » de la première section du fichier de notes.
let notes = [];
if (notesFile && existsSync(notesFile)) {
  const text = readFileSync(notesFile, "utf8");
  const section = text.split(/^##\s/m)[1] ?? text;
  notes = section
    .split("\n")
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .slice(0, 8);
}
// Build minimal accepté (mise à jour obligatoire en dessous) : ligne « minBuild: N » des notes.
const min = notesFile && existsSync(notesFile) ? readFileSync(notesFile, "utf8").match(/^minBuild:\s*(\d+)/m) : null;

const manifest = { version, build: Number(build), minBuild: min ? Number(min[1]) : 0, publishedAt: new Date().toISOString(), notes, apks };
writeFileSync(join(dir, "kombe-update.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ version, build: Number(build), abis: Object.keys(apks) }));
