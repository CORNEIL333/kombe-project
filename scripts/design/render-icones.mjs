// KÓMBE — génère les icônes d'application (PNG) depuis les signes officiels
// (packages/brand/marks, charte 01/08 « Icône app fond foncé ») :
//   PWA / iOS : packages/client/public/brand/kombe-icone-{180,192,512}.png
//   Android   : packages/mobile/android/app/src/main/res/mipmap-*/ic_launcher.png
//               packages/mobile/android/app/src/main/res/drawable/launch_logo.png
// Usage : node scripts/design/render-icones.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "../..");
const req = createRequire(resolve(root, "packages/client/package.json"));
const { chromium } = req("@playwright/test");

const inverse = readFileSync(resolve(root, "packages/brand/marks/kombe-symbol-inverse.svg"), "utf8");
const couleur = readFileSync(resolve(root, "packages/brand/marks/kombe-symbol.svg"), "utf8");
const FORET = "#103C32";

const b = await chromium.launch();
async function rendre(svg, taille, sortie, { fond = FORET, echelle = 0.62, rayon = 0 } = {}) {
  const p = await b.newPage({ viewport: { width: taille, height: taille }, deviceScaleFactor: 1 });
  const s = Math.round(taille * echelle);
  await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${taille}px;height:${taille}px;display:flex;align-items:center;justify-content:center;background:${fond};border-radius:${rayon}px;overflow:hidden">${svg.replace("<svg ", `<svg width="${s}" height="${s}" `)}</div></body></html>`);
  await p.screenshot({ path: sortie, omitBackground: true });
  await p.close();
}
const pub = resolve(root, "packages/client/public/brand");
for (const t of [180, 192, 512]) await rendre(inverse, t, `${pub}/kombe-icone-${t}.png`);
const res = resolve(root, "packages/mobile/android/app/src/main/res");
for (const [d, t] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]]) {
  await rendre(inverse, t, `${res}/mipmap-${d}/ic_launcher.png`, { rayon: Math.round(t * 0.22) });
}
await rendre(couleur, 288, `${res}/drawable/launch_logo.png`, { fond: "transparent", echelle: 0.9 });
console.log("icônes générées");
await b.close();
