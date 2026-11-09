// KÓMBE — génère le jeu d'icônes depuis icons/kombe-icons.json (source unique) :
//   icons/icons.ts                       module web (React, site, tableaux de bord)
//   ../client/public/brand/icons.svg     sprite <symbol> pour le HTML statique
//   ../mobile/lib/core/design/kombe_icons.g.dart  chaînes SVG pour flutter_svg
//   ../mobile/assets/brand/kombe-logo.json  géométrie du logo pour Flutter
// Usage : node packages/brand/scripts/build-icons.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(resolve(root, "icons/kombe-icons.json"), "utf8"));
const icons = Object.entries(src).filter(([k]) => k !== "_");
const HEAD = "GÉNÉRÉ par packages/brand/scripts/build-icons.mjs depuis icons/kombe-icons.json — ne pas éditer.";
const ATTRS = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

// 1) Module web
const ts = [
  `/* ${HEAD} */`,
  "export const ICONES = {",
  ...icons.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
  "} as const;",
  "export type NomIcone = keyof typeof ICONES;",
  `export const ATTRIBUTS_ICONE = ${JSON.stringify(ATTRS)};`,
  "/** Balise <svg> complète (décorative par défaut). */",
  "export function svgIcone(nom: NomIcone, taille = 24, classe = 'k-icon'): string {",
  "  return `<svg class=\"${classe}\" width=\"${taille}\" height=\"${taille}\" viewBox=\"0 0 24 24\" ${ATTRIBUTS_ICONE} aria-hidden=\"true\" focusable=\"false\">${ICONES[nom]}</svg>`;",
  "}",
  "",
].join("\n");
writeFileSync(resolve(root, "icons/icons.ts"), ts);

// 2) Sprite
const sprite = [
  `<svg xmlns="http://www.w3.org/2000/svg"><!-- ${HEAD} -->`,
  ...icons.map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24" ${ATTRS}>${v}</symbol>`),
  "</svg>",
  "",
].join("\n");
writeFileSync(resolve(root, "../client/public/brand/icons.svg"), sprite);

// 3) Flutter
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const dart = [
  `// ${HEAD}`,
  "// ignore_for_file: constant_identifier_names",
  "/// Icônes KÓMBE (SVG complets, couleur remplacée à l'affichage).",
  "abstract final class KombeIconData {",
  ...icons.map(([k, v]) => `  static const String ${camel(k)} = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${ATTRS.replace(/currentColor/g, "#000000")}>${v.replace(/currentColor/g, "#000000").replace(/'/g, "\\'")}</svg>';`),
  "}",
  "",
].join("\n");
writeFileSync(resolve(root, "../mobile/lib/core/design/kombe_icons.g.dart"), dart);

// 4) Géométrie du logo (web) : tracés du logotype, sans dépendre d'une police
const logo = JSON.parse(readFileSync(resolve(root, "marks/kombe-logo.json"), "utf8"));
writeFileSync(resolve(root, "icons/logo.ts"), [
  `/* ${HEAD.replace("icons/kombe-icons.json", "marks/kombe-logo.json")} */`,
  `export const LOGO = ${JSON.stringify({ colors: logo.colors, variants: logo.variants, ring: logo.ring, arcs: logo.arcs, nodes: logo.nodes, wordmark: logo.wordmark })} as const;`,
  "",
].join("\n"));

// 5) Géométrie du logo pour Flutter
mkdirSync(resolve(root, "../mobile/assets/brand"), { recursive: true });
copyFileSync(resolve(root, "marks/kombe-logo.json"), resolve(root, "../mobile/assets/brand/kombe-logo.json"));
copyFileSync(resolve(root, "marks/kombe-logo.json"), resolve(root, "../client/public/brand/kombe-logo.json"));
for (const f of ["kombe-symbol.svg", "kombe-symbol-inverse.svg", "kombe-logo-horizontal.svg", "kombe-logo-horizontal-inverse.svg", "kombe-logo-empile.svg", "kombe-logo-court.svg"]) copyFileSync(resolve(root, "marks", f), resolve(root, "../client/public/brand", f));
process.stdout.write(`${icons.length} icônes générées\n`);
