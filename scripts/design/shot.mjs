// Capture d'écran d'une URL (QA visuelle). Usage :
//   node scripts/design/shot.mjs <url|fichier> <sortie.png> [largeur=1280] [hauteur=800] [attente_ms=800] [pleine_page=0]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [target, out, w = "1280", h = "800", wait = "800", full = "0"] = process.argv.slice(2);
const url = existsSync(target) ? pathToFileURL(target).href : target;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.goto(url);
await p.waitForTimeout(+wait);
await p.screenshot({ path: out, fullPage: full === "1" });
if (errors.length) console.log(JSON.stringify({ errors }));
await b.close();
