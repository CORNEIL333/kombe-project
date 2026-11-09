// Plugin Figma local : recrée les écrans KÓMBE à partir des fichiers de docs/figma.
// .json de calques -> éléments modifiables ; .png -> image dans un cadre ; kombe.tokens.json -> variables et styles.
figma.showUI(__html__, { width: 340, height: 300 });

const FAMILLES = { mobile: "Mobile", pwa: "PWA", console: "Consoles", site: "Site" };
const GRAISSES = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };
const REPLI = { family: "Inter", style: "Regular" };
const ECART = 80, PAR_LIGNE = 12;
const sections = new Map();
let polices = null;
const chargees = new Set();

const rvb = (c) => ({ r: c.r, g: c.g, b: c.b });
const aplat = (c) => (c ? [{ type: "SOLID", color: rvb(c), opacity: c.a === undefined ? 1 : c.a }] : []);

async function police(famille, poids) {
  if (!polices) {
    polices = new Map();
    for (const f of await figma.listAvailableFontsAsync()) {
      if (!polices.has(f.fontName.family)) polices.set(f.fontName.family, new Set());
      polices.get(f.fontName.family).add(f.fontName.style);
    }
  }
  const styles = polices.get(famille);
  let choix = REPLI;
  if (styles) {
    const voulu = Math.round((poids || 400) / 100) * 100;
    const ordre = [voulu, 500, 400, 600, 700, 800, 300].map((p) => GRAISSES[p]);
    const style = ordre.find((s) => styles.has(s)) || [...styles][0];
    choix = { family: famille, style };
  }
  const cle = `${choix.family}/${choix.style}`;
  if (!chargees.has(cle)) { await figma.loadFontAsync(choix); chargees.add(cle); }
  return choix;
}

function ombre(texte) {
  // Forme calculée par le navigateur : « rgba(8, 44, 38, 0.2) 0px 8px 24px -12px ».
  const m = /rgba?\(([^)]+)\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?(\s+inset)?/.exec(texte || "");
  if (!m) return [];
  const v = m[1].split(",").map(Number);
  return [{
    type: m[6] ? "INNER_SHADOW" : "DROP_SHADOW", color: { r: v[0] / 255, g: v[1] / 255, b: v[2] / 255, a: v[3] === undefined ? 1 : v[3] },
    offset: { x: Number(m[2]), y: Number(m[3]) }, radius: Number(m[4]), spread: Number(m[5] || 0), visible: true, blendMode: "NORMAL",
  }];
}

async function creerTexte(n, ox, oy) {
  const t = figma.createText();
  t.fontName = await police(n.font, n.weight);
  t.characters = n.text;
  t.fontSize = Math.max(1, n.size);
  t.fills = aplat(n.color);
  if (n.lh) t.lineHeight = { value: n.lh, unit: "PIXELS" };
  if (n.ls) t.letterSpacing = { value: n.ls, unit: "PIXELS" };
  const a = { center: "CENTER", right: "RIGHT", end: "RIGHT", justify: "JUSTIFIED" }[n.align];
  if (a) t.textAlignHorizontal = a;
  if (n.multi) { t.textAutoResize = "HEIGHT"; t.resize(Math.max(1, n.w + 1), Math.max(1, n.h)); }
  else t.textAutoResize = "WIDTH_AND_HEIGHT";
  t.name = n.name || "Texte";
  t.x = n.x - ox; t.y = n.y - oy;
  return t;
}

function creerImage(n, ox, oy) {
  const r = figma.createRectangle();
  r.name = n.name || "Image";
  r.resize(Math.max(1, n.w), Math.max(1, n.h));
  r.x = n.x - ox; r.y = n.y - oy;
  if (n.radius) r.cornerRadius = n.radius;
  if (n.opacity !== undefined && n.opacity < 1) r.opacity = n.opacity;
  const b64 = n.data ? n.data.split(",")[1] : null;
  if (b64) r.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: figma.createImage(figma.base64Decode(b64)).hash }];
  else r.fills = aplat({ r: 0.9, g: 0.87, b: 0.8 });
  return r;
}

function creerSvg(n, ox, oy) {
  const s = figma.createNodeFromSvg(n.svg);
  s.name = n.name || "Icône";
  s.x = n.x - ox; s.y = n.y - oy;
  return s;
}

async function creerBoite(n, ox, oy, alertes) {
  const f = figma.createFrame();
  f.name = n.name || "Bloc";
  f.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
  f.x = n.x - ox; f.y = n.y - oy;
  f.clipsContent = false;
  f.fills = aplat(n.fill);
  const [a, b, c, d] = n.radius || [0, 0, 0, 0];
  f.topLeftRadius = a; f.topRightRadius = b; f.bottomRightRadius = c; f.bottomLeftRadius = d;
  if (n.stroke && n.stroke.c) { f.strokes = aplat(n.stroke.c); f.strokeWeight = n.stroke.w; f.strokeAlign = "INSIDE"; }
  else if (n.bottom && n.bottom.c) {
    f.strokes = aplat(n.bottom.c); f.strokeAlign = "INSIDE";
    f.strokeTopWeight = 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0; f.strokeBottomWeight = n.bottom.w;
  }
  if (n.shadow) f.effects = ombre(n.shadow);
  if (n.opacity !== undefined && n.opacity < 1) f.opacity = n.opacity;
  await ajouter(f, n.children || [], n.x, n.y, alertes);
  return f;
}

async function ajouter(parent, enfants, ox, oy, alertes) {
  for (const n of enfants) {
    try {
      const fait = n.t === "text" ? await creerTexte(n, ox, oy) : n.t === "image" ? creerImage(n, ox, oy) : n.t === "svg" ? creerSvg(n, ox, oy) : await creerBoite(n, ox, oy, alertes);
      parent.appendChild(fait);
    } catch (e) { alertes.push(`${n.t} « ${n.name} » : ${e.message}`); }
  }
}

async function pagePour(famille) {
  const nom = FAMILLES[famille] || famille;
  await figma.loadAllPagesAsync();
  let p = figma.root.children.find((x) => x.name === nom);
  if (!p) {
    try { p = figma.createPage(); p.name = nom; }
    catch (e) { p = figma.currentPage; } // offre gratuite : nombre de pages limité
  }
  await figma.setCurrentPageAsync(p);
  return p;
}

async function sectionPour(groupe) {
  if (sections.has(groupe)) return sections.get(groupe);
  const page = await pagePour(groupe.split("-")[0]);
  const s = figma.createSection();
  s.name = groupe;
  const bas = page.children.filter((n) => n !== s).reduce((m, n) => Math.max(m, n.y + n.height), -ECART * 2);
  s.x = 0; s.y = bas + ECART * 2;
  page.appendChild(s);
  const etat = { s, x: ECART, y: ECART, haut: 0, n: 0, larg: 0 };
  sections.set(groupe, etat);
  return etat;
}

function placer(etat, cadre) {
  if (etat.n && etat.n % PAR_LIGNE === 0) { etat.x = ECART; etat.y += etat.haut + ECART; etat.haut = 0; }
  cadre.x = etat.x; cadre.y = etat.y;
  etat.s.appendChild(cadre);
  etat.x += cadre.width + ECART;
  etat.larg = Math.max(etat.larg, etat.x);
  etat.haut = Math.max(etat.haut, cadre.height);
  etat.n += 1;
  etat.s.resizeWithoutConstraints(Math.max(etat.larg, 1), etat.y + etat.haut + ECART);
}

function decouper(nom) {
  const base = nom.replace(/\.(png|json)$/, "");
  const i = base.indexOf("__");
  return i < 0 ? { groupe: "autres", ecran: base } : { groupe: base.slice(0, i), ecran: base.slice(i + 2) };
}

async function importerCalques(nom, texte, alertes) {
  const d = JSON.parse(texte);
  const etat = await sectionPour(d.groupe);
  const f = figma.createFrame();
  f.name = d.nom;
  f.resize(d.w, Math.max(1, d.h));
  f.fills = aplat(d.fill);
  f.clipsContent = true;
  await ajouter(f, d.children, 0, 0, alertes);
  placer(etat, f);
}

async function importerImage(nom, octets) {
  const { groupe, ecran } = decouper(nom);
  const etat = await sectionPour(groupe);
  const image = figma.createImage(octets);
  const { width, height } = await image.getSizeAsync();
  const f = figma.createFrame();
  // Toutes les captures sont faites à deux fois la taille d'affichage côté mobile.
  const k = groupe.startsWith("mobile") ? 2 : 1;
  f.name = ecran;
  f.resize(width / k, height / k);
  f.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];
  placer(etat, f);
}

function hex(v) {
  const n = parseInt(v.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

async function importerJetons(texte) {
  const j = JSON.parse(texte);
  const col = figma.variables.createVariableCollection("KÓMBE");
  const mode = col.modes[0].modeId;
  const visiter = (o, chemin) => {
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith("$")) continue;
      if (v && v.$value !== undefined) {
        const nom = [...chemin, k].join("/");
        if (v.$type === "color") figma.variables.createVariable(nom, col, "COLOR").setValueForMode(mode, hex(v.$value));
        else if (v.$type === "dimension") figma.variables.createVariable(nom, col, "FLOAT").setValueForMode(mode, parseFloat(v.$value));
      } else if (v && typeof v === "object") visiter(v, [...chemin, k]);
    }
  };
  visiter({ couleur: j.couleur, rayon: j.rayon, espace: j.espace }, []);
  for (const [nom, s] of Object.entries(j.texte || {})) {
    const v = s.$value;
    const style = figma.createTextStyle();
    style.name = nom;
    style.fontName = await police(v.fontFamily, v.fontWeight);
    style.fontSize = parseFloat(v.fontSize);
    style.lineHeight = { value: parseFloat(v.lineHeight), unit: "PIXELS" };
  }
}

figma.ui.onmessage = async (m) => {
  if (m.type === "fin") { figma.notify("Import KÓMBE terminé"); return; }
  if (m.type !== "fichier") return;
  const alertes = [];
  try {
    if (m.nom.endsWith(".tokens.json")) await importerJetons(m.contenu);
    else if (m.nom.endsWith(".json")) await importerCalques(m.nom, m.contenu, alertes);
    else await importerImage(m.nom, m.contenu);
  } catch (e) { alertes.push(e.message); }
  figma.ui.postMessage({ type: "suivant", erreur: alertes.length ? `${m.nom} : ${alertes.slice(0, 2).join(" ; ")}` : null });
};
