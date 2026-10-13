// KÓMBE — génération des jetons : JSON canonique → CSS (web) + Dart (Flutter).
// Usage : node packages/brand/scripts/build-tokens.mjs [--check]
//   --check : échoue si les fichiers générés ne correspondent pas au JSON.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const t = JSON.parse(readFileSync(resolve(root, "tokens/kombe.tokens.json"), "utf8"));
const check = process.argv.includes("--check");

const HEADER = "GÉNÉRÉ par packages/brand/scripts/build-tokens.mjs depuis tokens/kombe.tokens.json — ne pas éditer.";
const bez = (a) => `cubic-bezier(${a.join(", ")})`;

export function buildCss(tk) {
  const L = [];
  L.push(`/* ${HEADER} */`);
  L.push(`@font-face { font-family: "Manrope"; src: url("../fonts/Manrope-Variable.woff2") format("woff2"); font-weight: 200 800; font-display: swap; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0300-0301, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }`);
  L.push(`@font-face { font-family: "Manrope"; src: url("../fonts/Manrope-Variable-ext.woff2") format("woff2"); font-weight: 200 800; font-display: swap; unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }`);
  L.push(`@font-face { font-family: "Fraunces"; src: url("../fonts/Fraunces-Variable.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }`);
  L.push(`@font-face { font-family: "Fraunces"; src: url("../fonts/Fraunces-Variable-Italic.woff2") format("woff2"); font-weight: 100 900; font-style: italic; font-display: swap; }`);
  L.push(":root {");
  for (const [scale, steps] of Object.entries(tk.color)) for (const [k, v] of Object.entries(steps)) L.push(`  --k-${scale}-${k}: ${v};`);
  for (const [k, v] of Object.entries(tk.semantic)) L.push(`  --k-${k}: ${v};`);
  tk.dataviz.forEach((v, i) => L.push(`  --k-dataviz-${i + 1}: ${v};`));
  L.push(`  --k-font-ui: "${tk.font["family-ui"]}", ${tk.font.fallback};`);
  L.push(`  --k-font-display: "${tk.font["family-display"]}", ui-serif, Georgia, serif;`);
  for (const [k, s] of Object.entries(tk.type)) {
    L.push(`  --k-type-${k}-size: ${s.size / 16}rem;`);
    L.push(`  --k-type-${k}-line: ${s.line / 16}rem;`);
    L.push(`  --k-type-${k}-weight: ${s.weight};`);
    L.push(`  --k-type-${k}-tracking: ${s.tracking}em;`);
  }
  for (const [k, v] of Object.entries(tk.space)) L.push(`  --k-space-${k}: ${v / 16}rem;`);
  for (const [k, v] of Object.entries(tk.radius)) L.push(`  --k-radius-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(tk.shadow)) L.push(`  --k-shadow-${k}: ${v};`);
  for (const [k, v] of Object.entries(tk.motion.duration)) L.push(`  --k-motion-${k}: ${v}ms;`);
  for (const [k, v] of Object.entries(tk.motion.easing)) L.push(`  --k-ease-${k}: ${bez(v)};`);
  L.push(`  --k-touch-min: ${tk.touch.min}px;`);
  for (const [k, v] of Object.entries(tk.layout)) L.push(`  --k-layout-${k}: ${v}px;`);
  L.push("}");
  // Mouvement réduit : les durées tombent à un fondu court, jamais à zéro
  // brutal qui casserait la hiérarchie (mandat §39).
  L.push("@media (prefers-reduced-motion: reduce) {");
  L.push("  :root {");
  for (const k of Object.keys(tk.motion.duration)) L.push(`    --k-motion-${k}: ${Math.min(tk.motion.duration[k], 120)}ms;`);
  L.push("  }");
  L.push("}");
  return L.join("\n") + "\n";
}

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const dartColor = (hex) => `Color(0xFF${hex.slice(1).toUpperCase()})`;

export function buildDart(tk) {
  const L = [];
  L.push(`// ${HEADER}`);
  L.push("// ignore_for_file: constant_identifier_names");
  L.push("import 'package:flutter/animation.dart';");
  L.push("import 'package:flutter/painting.dart';");
  L.push("");
  L.push("abstract final class KombeTokens {");
  for (const [scale, steps] of Object.entries(tk.color)) for (const [k, v] of Object.entries(steps)) L.push(`  static const Color ${scale}${k} = ${dartColor(v)};`);
  for (const [k, v] of Object.entries(tk.semantic)) L.push(`  static const Color ${camel(k)} = ${dartColor(v)};`);
  L.push(`  static const List<Color> dataviz = <Color>[${tk.dataviz.map(dartColor).join(", ")}];`);
  L.push(`  static const String fontUi = '${tk.font["family-ui"]}';`);
  L.push(`  static const String fontDisplay = '${tk.font["family-display"]}';`);
  for (const [k, v] of Object.entries(tk.space)) L.push(`  static const double space${k} = ${v};`);
  for (const [k, v] of Object.entries(tk.radius)) L.push(`  static const double radius${k[0].toUpperCase()}${k.slice(1)} = ${v};`);
  L.push(`  static const double touchMin = ${tk.touch.min};`);
  for (const [k, v] of Object.entries(tk.layout)) L.push(`  static const double ${camel("layout-" + k)} = ${v};`);
  for (const [k, v] of Object.entries(tk.breakpoint)) L.push(`  static const double ${camel("bp-" + k)} = ${v};`);
  L.push("}");
  L.push("");
  L.push("abstract final class KombeMotion {");
  for (const [k, v] of Object.entries(tk.motion.duration)) L.push(`  static const Duration ${k} = Duration(milliseconds: ${v});`);
  L.push("}");
  L.push("");
  L.push("abstract final class KombeEasing {");
  for (const [k, v] of Object.entries(tk.motion.easing)) L.push(`  static const Curve ${k} = Cubic(${v.join(", ")});`);
  L.push("}");
  L.push("");
  L.push("class KombeTypeSpec {");
  L.push("  const KombeTypeSpec(this.size, this.line, this.weight, this.display, this.tracking);");
  L.push("  final double size;");
  L.push("  final double line;");
  L.push("  final int weight;");
  L.push("  final bool display;");
  L.push("  final double tracking;");
  L.push("}");
  L.push("");
  L.push("abstract final class KombeTypeScale {");
  for (const [k, s] of Object.entries(tk.type)) L.push(`  static const KombeTypeSpec ${camel(k)} = KombeTypeSpec(${s.size}, ${s.line}, ${s.weight}, ${s.family === "display"}, ${s.tracking});`);
  L.push("}");
  return L.join("\n") + "\n";
}

// ── Contraste WCAG 2.2 : porte de qualité sur les paires texte réellement utilisées.
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
export const REQUIRED_PAIRS = [
  ["content-primary", "surface-canvas", 4.5],
  ["content-secondary", "surface-canvas", 4.5],
  ["content-secondary", "surface-raised", 4.5],
  ["content-secondary", "surface-sunken", 4.5],
  ["content-inverse", "brand", 4.5],
  ["content-inverse", "brand-action", 4.5],
  ["success", "success-surface", 4.5],
  ["warning", "warning-surface", 4.5],
  ["danger", "danger-surface", 4.5],
  ["info", "info-surface", 4.5],
  ["accent", "brand", 3],
  ["focus", "surface-canvas", 3],
  ["content-tertiary", "surface-raised", 3],
];
export function checkContrast(tk) {
  return REQUIRED_PAIRS.map(([fg, bg, min]) => ({ fg, bg, min, ratio: +contrast(tk.semantic[fg], tk.semantic[bg]).toFixed(2) })).map((r) => ({ ...r, ok: r.ratio >= r.min }));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = checkContrast(t).filter((r) => !r.ok);
  if (failures.length) {
    console.error("Contraste insuffisant :", failures);
    process.exit(1);
  }
  const outputs = [
    [resolve(root, "css/kombe.css"), buildCss(t)],
    [resolve(root, "../mobile/lib/core/design/kombe_tokens.g.dart"), buildDart(t)],
  ];
  let stale = false;
  for (const [file, content] of outputs) {
    if (check) {
      let current = "";
      try { current = readFileSync(file, "utf8"); } catch { /* absent */ }
      if (current !== content) { console.error(`Périmé : ${file}`); stale = true; }
    } else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
      console.log(`écrit ${file}`);
    }
  }
  if (stale) process.exit(1);
}
