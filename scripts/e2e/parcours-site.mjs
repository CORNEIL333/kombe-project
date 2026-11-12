#!/usr/bin/env node
// KÓMBE — parcours navigateur du site public, en français et en anglais (A16).
//
// Sert `dist-web` en local (aucun réseau), ouvre les 20 pages du site (10 en
// français, 10 en anglais) en 1280 et 390 px, avec et sans mouvement réduit.
// Pour chaque page : aucune erreur JavaScript, aucun défilement horizontal,
// aucune violation axe-core (WCAG 2.2 AA) une fois la page posée, et, pour
// les pages anglaises, aucun texte d'interface resté en français.
//
// Prérequis : `node scripts/build-web.mjs`. Sortie : 0 PASS, 1 FAIL, 2 BLOCKED.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const web = join(root, "dist-web");
if (!existsSync(join(web, "site/en/index.html"))) {
  console.log(JSON.stringify({ status: "BLOCKED", reason: "dist-web absent : lancez node scripts/build-web.mjs" }));
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.log(JSON.stringify({ status: "BLOCKED", reason: "playwright indisponible" }));
  process.exit(2);
}
const axe = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let f = join(web, p);
  if (!f.startsWith(web)) { res.writeHead(403).end(); return; }
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${server.address().port}`;

const fr = ["/site/", "/site/a-propos/", "/site/aide/", "/site/securite/", "/site/telecharger/", "/site/legal/", "/site/legal/conditions/", "/site/legal/mentions-legales/", "/site/legal/cookies/", "/site/legal/confidentialite/"];
const en = ["/site/en/", "/site/en/about/", "/site/en/help/", "/site/en/security/", "/site/en/download/", "/site/en/legal/", "/site/en/legal/terms/", "/site/en/legal/notice/", "/site/en/legal/cookies/", "/site/en/legal/privacy/"];
// Mots d'interface français sans homographe anglais courant (les noms propres d'exemple et « Français » sont exclus).
const francais = /(?<![\p{L}])(cotisation|séance|membres|groupe|bureau|trésorier|Créer un compte|Se connecter|Aide|À propos|Accueil|Télécharger|Confidentialité|Centre juridique)(?![\p{L}])/iu;

const browser = await chromium.launch();
const results = {};
for (const reduce of [false, true]) {
  for (const w of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, ...(reduce ? { reducedMotion: "reduce" } : {}) });
    for (const p of [...fr, ...en]) {
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e)));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      const r = await page.goto(B + p, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000); // animations posées : on mesure l'état stable
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      await page.addScriptTag({ content: axe });
      const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((x) => `${x.id}(${x.nodes.length})`));
      let resteFr = [];
      if (p.startsWith("/site/en/")) {
        const texts = await page.evaluate(() => document.body.innerText.split("\n").concat([...document.querySelectorAll("[aria-label],[alt],[title]")].map((e) => e.getAttribute("aria-label") || e.getAttribute("alt") || e.getAttribute("title") || "")));
        resteFr = texts.map((t) => t.replace(/kombe\.[\w.]+(\/\w+)?/g, "")).filter((t) => francais.test(t) && !/Les Étoiles|Français/.test(t)).slice(0, 5);
      }
      const ok = r?.status() === 200 && !scroll && errs.length === 0 && v.length === 0 && resteFr.length === 0;
      results[`${p}@${w}${reduce ? "-reduit" : ""}`] = ok ? "OK" : { status: r?.status(), scroll, errs: errs.slice(0, 3), axe: v, resteFr };
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
server.close();
const bad = Object.fromEntries(Object.entries(results).filter(([, x]) => x !== "OK"));
const status = Object.keys(bad).length === 0 ? "PASS" : "FAIL";
console.log(JSON.stringify({ target: "kombe.site.fr-en", status, pages: Object.keys(results).length, defauts: bad }, null, 2));
process.exit(status === "PASS" ? 0 : 1);
