/**
 * I-01 / I-08 — garde de copie sur TOUS les textes affichés du dépôt :
 * dictionnaires de la PWA, fichiers .arb et littéraux Dart du mobile, sources
 * des tableaux de bord et du site. Un mot interdit (épargne, solde, retrait,
 * débité, « validé par le serveur », chiffrement, garantie…) fait échouer la
 * suite. Les commentaires de code ne sont pas du texte affiché : ils sont
 * retirés avant l'analyse.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { forbiddenCopyIn } from "../src/index.js";

const root = resolve(__dirname, "../../..");

function walk(dir: string, exts: readonly string[], out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === "build" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e)) && !/\.(test|spec)\.|\/test\//.test(p)) out.push(p);
  }
  return out;
}

/** Retire les commentaires // et /* *\/ (approximation suffisante pour du texte UI). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

/** Littéraux de chaîne et textes JSX qui ressemblent à une phrase affichée. */
function displayedStrings(src: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|>([^<>{}]{6,})</g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const s = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    if (/[a-zà-ÿ]{3,}\s+[a-zà-ÿ]/i.test(s) && !/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(s)) out.push(s);
  }
  return out;
}

function hits(files: readonly string[], extract: (src: string) => string[]) {
  const found: { file: string; text: string; motifs: string[] }[] = [];
  for (const f of files) {
    for (const text of extract(readFileSync(f, "utf8"))) {
      const motifs = forbiddenCopyIn(text);
      if (motifs.length) found.push({ file: f.slice(root.length + 1), text: text.slice(0, 120), motifs });
    }
  }
  return found;
}

describe("copie produit — aucun mot interdit dans les textes affichés", () => {
  it("dictionnaires de la PWA (FR/EN)", () => {
    const files = walk(resolve(root, "packages/client/src/i18n"), [".ts"]);
    expect(files.length).toBeGreaterThan(0);
    expect(hits(files, (s) => displayedStrings(stripComments(s)))).toEqual([]);
  });

  it("fichiers .arb du mobile (FR/EN)", () => {
    const files = walk(resolve(root, "packages/mobile/lib"), [".arb"]);
    expect(files.length).toBeGreaterThan(0);
    const extract = (s: string) =>
      Object.entries(JSON.parse(s) as Record<string, unknown>)
        .filter(([k, v]) => !k.startsWith("@") && typeof v === "string")
        .map(([, v]) => v as string);
    expect(hits(files, extract)).toEqual([]);
  });

  it("écrans du mobile (littéraux Dart)", () => {
    const files = walk(resolve(root, "packages/mobile/lib"), [".dart"]);
    expect(hits(files, (s) => displayedStrings(stripComments(s)))).toEqual([]);
  });

  it("PWA, tableaux de bord et site (composants)", () => {
    const files = [
      ...walk(resolve(root, "packages/client/src"), [".tsx", ".ts"]),
      ...walk(resolve(root, "packages/dashboard-core/src"), [".tsx", ".ts"]),
      ...walk(resolve(root, "apps"), [".tsx", ".ts", ".html"]),
    ];
    expect(hits(files, (s) => displayedStrings(stripComments(s)))).toEqual([]);
  });
});
