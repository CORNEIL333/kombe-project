// Génère docs/figma/INVENTAIRE.md et inventaire.csv à partir des fichiers présents.
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
const racine = process.argv[2] ?? "docs/figma";
const web = JSON.parse(readFileSync(`${racine}/inventaire-web.json`, "utf8"));
const lignes = web.map((x) => ({ ...x, source: "Web", format: "Calques + PNG" }));
for (const f of readdirSync(`${racine}/ecrans`).filter((x) => x.startsWith("mobile"))) {
  const [groupe, nom] = f.replace(".png", "").split("__");
  const b = readFileSync(`${racine}/ecrans/${f}`);
  lignes.push({ groupe, nom, route: "", largeur: b.readUInt32BE(16) / 2, hauteur: b.readUInt32BE(20) / 2, source: "Flutter", format: "PNG" });
}
const titres = { mobile: "Application mobile", pwa: "PWA", console: "Consoles", site: "Site public" };
lignes.sort((a, b) => a.groupe.localeCompare(b.groupe) || a.nom.localeCompare(b.nom));
const groupes = [...new Set(lignes.map((l) => l.groupe))];
let md = `# Inventaire des écrans\n\n**${lignes.length} captures** dans ${groupes.length} groupes. Généré par \`scripts/figma/inventaire.mjs\`.\n\n| Groupe | Écrans | Format |\n|---|---|---|\n`;
for (const g of groupes) { const l = lignes.filter((x) => x.groupe === g); md += `| ${g} | ${l.length} | ${l[0].format} |\n`; }
for (const [cle, titre] of Object.entries(titres)) {
  md += `\n## ${titre}\n`;
  for (const g of groupes.filter((x) => x.startsWith(cle))) {
    md += `\n### ${g}\n\n| Écran | Route | Taille |\n|---|---|---|\n`;
    for (const l of lignes.filter((x) => x.groupe === g)) md += `| ${l.nom} | ${l.route ? `\`${l.route}\`` : "—"} | ${l.largeur} × ${l.hauteur} |\n`;
  }
}
writeFileSync(`${racine}/INVENTAIRE.md`, md);
writeFileSync(`${racine}/inventaire.csv`, "﻿groupe;ecran;route;largeur;hauteur;source;format\n" + lignes.map((l) => [l.groupe, l.nom, l.route, l.largeur, l.hauteur, l.source, l.format].join(";")).join("\n") + "\n");
for (const f of ["inventaire-web.json"]) if (existsSync(`${racine}/${f}`)) rmSync(`${racine}/${f}`);
console.log(lignes.length, groupes.length);
