// Fait tourner docs/figma/plugin/code.js contre une imitation de l'API Figma.
// Prouve que le plugin lit tous les fichiers sans erreur de logique ; ne remplace pas un essai dans Figma.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const racine = process.argv[2] ?? "docs/figma";
let noeuds = 0, svg = 0, textes = 0, images = 0;
const compte = {};
const noeud = (type) => {
  noeuds += 1; compte[type] = (compte[type] ?? 0) + 1;
  return {
    type, x: 0, y: 0, width: 1, height: 1, children: [], name: "",
    resize(w, h) { if (!(w > 0) || !(h > 0) || !Number.isFinite(w + h)) throw new Error(`taille invalide ${w}x${h}`); this.width = w; this.height = h; },
    resizeWithoutConstraints(w, h) { this.resize(w, h); },
    appendChild(c) { this.children.push(c); },
  };
};
const pages = [];
const figma = {
  showUI() {}, notify() {},
  root: { children: pages },
  currentPage: noeud("PAGE"),
  ui: { postMessage(m) { reponse(m); } },
  listAvailableFontsAsync: async () => ["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"].flatMap((style) => ["Libre Franklin", "Manrope", "Inter"].map((family) => ({ fontName: { family, style } }))).concat([{ fontName: { family: "Merriweather", style: "Regular" } }]),
  loadFontAsync: async () => {},
  loadAllPagesAsync: async () => {},
  setCurrentPageAsync: async (p) => { figma.currentPage = p; },
  createPage() { const p = noeud("PAGE"); pages.push(p); return p; },
  createSection: () => noeud("SECTION"),
  createFrame: () => noeud("FRAME"),
  createRectangle() { images += 1; return noeud("RECT"); },
  createText() {
    textes += 1;
    const t = noeud("TEXT");
    let police = null;
    return new Proxy(t, { set(o, k, v) { if (k === "fontName") police = v; if (k === "characters" && !police) throw new Error("police non chargée"); if (k === "characters" && !v) throw new Error("texte vide"); o[k] = v; return true; } });
  },
  createNodeFromSvg(s) { if (!s.startsWith("<svg")) throw new Error("svg invalide"); svg += 1; return noeud("SVG"); },
  createImage: () => ({ hash: "h", getSizeAsync: async () => ({ width: 780, height: 1688 }) }),
  base64Decode: (s) => Buffer.from(s, "base64"),
  createTextStyle: () => ({}),
  variables: { createVariableCollection: () => ({ modes: [{ modeId: "m" }] }), createVariable: () => ({ setValueForMode(_, v) { if (v === undefined || Number.isNaN(v)) throw new Error("valeur invalide"); } }) },
};
let reponse = () => {};
vm.runInNewContext(readFileSync(join(racine, "plugin/code.js"), "utf8"), { figma, __html__: "", console, parseInt, parseFloat, Math, JSON, Map, Set, Number, Object });
const envoyer = (msg) => new Promise((ok) => { reponse = ok; figma.ui.onmessage(msg); });

const erreurs = [];
const calques = readdirSync(join(racine, "calques"));
const ecrans = readdirSync(join(racine, "ecrans"));
const jetons = await envoyer({ type: "fichier", nom: "kombe.tokens.json", contenu: readFileSync(join(racine, "jetons/kombe.tokens.json"), "utf8") });
if (jetons.erreur) erreurs.push(jetons.erreur);
for (const f of calques) {
  const r = await envoyer({ type: "fichier", nom: f, contenu: readFileSync(join(racine, "calques", f), "utf8") });
  if (r.erreur) erreurs.push(r.erreur);
}
for (const f of ecrans.filter((x) => x.startsWith("mobile"))) {
  const r = await envoyer({ type: "fichier", nom: f, contenu: new Uint8Array(1) });
  if (r.erreur) erreurs.push(r.erreur);
}
console.log(JSON.stringify({ calques: calques.length, images: ecrans.filter((x) => x.startsWith("mobile")).length, pages: pages.map((p) => p.name), noeuds, textes, svg, rectangles: images, compte, erreurs: erreurs.length }));
console.log(erreurs.slice(0, 8).join("\n"));
process.exit(erreurs.length ? 1 : 0);
