#!/usr/bin/env node
// KÓMBE — branche de sauvegarde Neon avant une mise à jour (une par version).
//
// La production est la branche PAR DÉFAUT du projet Neon (jamais identifiée
// par un nom de base comme « kombe_prod », qui désigne une ancienne piste
// vide, voir docs/production-readiness/11_runbook.md). Copie à l'écriture :
// aucune écriture sur la production, aucun coût de copie.
//
// Usage : NEON_API_KEY=… node scripts/neon-sauvegarde.mjs <version>   (ex. 0.8.1)
//   NEON_PROJECT_ID (défaut : square-resonance-19892972, projet « kombe »)
// Règle : une seule sauvegarde par version ; le script refuse d'en créer une
// seconde. Il liste les sauvegardes existantes et ne supprime RIEN.
const KEY = process.env.NEON_API_KEY;
const PROJECT = process.env.NEON_PROJECT_ID ?? "square-resonance-19892972";
const version = process.argv[2];
if (!KEY) { console.error("NEON_API_KEY absente."); process.exit(2); }
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) { console.error("Usage : node scripts/neon-sauvegarde.mjs <version X.Y.Z>"); process.exit(2); }

const api = async (method, path, body) => {
  const r = await fetch(`https://console.neon.tech/api/v2/projects/${PROJECT}${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${j.message ?? ""}`);
  return j;
};

const { branches } = await api("GET", "/branches");
const prod = branches.find((b) => b.default || b.primary);
if (!prod) { console.error("Aucune branche par défaut : production introuvable, rien n'est fait."); process.exit(1); }
const prefixe = `sauvegarde-avant-${version.replaceAll(".", "-")}-`;
const deja = branches.find((b) => b.name.startsWith(prefixe));
if (deja) { console.error(`Une sauvegarde existe déjà pour ${version} : ${deja.name} (${deja.id}). Rien n'est fait.`); process.exit(1); }

const jour = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const { branch } = await api("POST", "/branches", { branch: { parent_id: prod.id, name: `${prefixe}${jour}` } });
console.log(`✓ Sauvegarde ${branch.name} (${branch.id}) de « ${prod.name} » (${prod.id}) au LSN ${branch.parent_lsn ?? "?"}.`);

const sauvegardes = [...branches.filter((b) => b.name.startsWith("sauvegarde-avant-")), branch].sort((a, b) => a.created_at.localeCompare(b.created_at));
console.log(`Sauvegardes présentes (${sauvegardes.length}) :`);
for (const b of sauvegardes) console.log(`  ${b.created_at.slice(0, 10)}  ${b.name}  ${b.id}`);
if (sauvegardes.length > 2) console.log("ℹ Politique : conserver les 2 dernières ; supprimez les plus anciennes dans la console Neon une fois la mise à jour validée.");
console.log(`Branches : ${branches.length + 1} sur la limite du plan (10 en offre gratuite).`);
