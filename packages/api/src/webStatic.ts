/**
 * Service du site web (PWA + tableaux de bord + site) par l'API elle-même,
 * pour un déploiement en UN service (Docker/Render, poste local) : même
 * origine que /v1, donc ni CORS ni URL d'API collée au build. Activé seulement
 * si KOMBE_WEB_ROOT désigne le dossier produit par `scripts/build-web.mjs`.
 * Sur Vercel, ce rôle est tenu par la plateforme (vercel.json), pas par ceci.
 *
 * Sûreté : GET/HEAD seulement, jamais sous /v1, chemin normalisé et confiné
 * au dossier racine (aucune remontée « .. »), types MIME fermés.
 */
import { createReadStream, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** CSP des pages web : tout vient de la même origine (API comprise), sauf les
 *  polices Google ; styles en ligne permis (attributs style de React). */
export const WEB_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

/** Résout un chemin d'URL en fichier DANS `root`, ou null (hors racine, absent). */
export function resolveWebFile(root: string, urlPath: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return null;
  }
  if (p.includes("\0")) return null;
  const base = resolve(root);
  let target = resolve(base, `.${p.startsWith("/") ? p : `/${p}`}`);
  if (target !== base && !target.startsWith(base + sep)) return null;
  try {
    let st = statSync(target);
    if (st.isDirectory()) {
      target = resolve(target, "index.html");
      st = statSync(target);
    }
    return st.isFile() ? target : null;
  } catch {
    return null;
  }
}

export function registerWebStatic(app: FastifyInstance, root: string): void {
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0] ?? "/";
    if ((request.method !== "GET" && request.method !== "HEAD") || path === "/v1" || path.startsWith("/v1/")) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Route inconnue" });
    }
    // /bureau → /bureau/ (les ressources de chaque tableau de bord sont relatives à son préfixe).
    if (!path.endsWith("/") && !extname(path) && resolveWebFile(root, `${path}/`)) {
      return reply.redirect(`${path}/`, 301);
    }
    const file = resolveWebFile(root, path);
    if (!file) return reply.code(404).type("text/plain; charset=utf-8").send("Introuvable");
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    const immutable = file.includes(`${sep}assets${sep}`);
    reply
      .type(type)
      .header("content-security-policy", WEB_CSP)
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .header("cache-control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
    if (type.startsWith("text/html")) reply.header("x-frame-options", "DENY");
    return reply.send(createReadStream(file));
  });
}
