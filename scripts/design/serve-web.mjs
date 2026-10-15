// Sert dist-web/ comme Vercel (même origine) pour la QA visuelle locale.
// /v1/* est relayé vers une API réelle (défaut : production) — lecture seule
// en pratique : la QA n'envoie que des requêtes d'affichage.
// Usage : node scripts/design/serve-web.mjs [port=4400] [api=https://kombe.vercel.app]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../dist-web", import.meta.url)));
const [port = "4400", api = "https://kombe.vercel.app"] = process.argv.slice(2);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4" };

async function file(p) {
  try { const s = await stat(p); return s.isFile() ? p : s.isDirectory() ? file(join(p, "index.html")) : null; } catch { return null; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/v1/")) {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
    const r = await fetch(api + url.pathname + url.search, { method: req.method, headers: { "content-type": req.headers["content-type"] ?? "application/json", authorization: req.headers.authorization ?? "" }, body });
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let p = await file(join(root, decodeURIComponent(url.pathname)));
  // Repli SPA : chaque application retombe sur son propre index.html.
  if (!p) {
    const seg = url.pathname.split("/")[1];
    p = (await file(join(root, seg, "index.html"))) ?? (await file(join(root, "index.html")));
  }
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
  res.end(await readFile(p));
}).listen(+port, () => console.log(`dist-web servi sur http://localhost:${port} (API → ${api})`));
