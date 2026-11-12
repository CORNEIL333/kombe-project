/* KÓMBE — garde de vocabulaire : KÓMBE ne détient aucun argent. Les textes
   affichés aux membres n'emploient jamais le vocabulaire bancaire qui le
   laisserait croire (épargne, solde, retrait, débité, sécurisé, garanti),
   en français comme en anglais (savings, balance, withdrawal, debited,
   secured, guaranteed). */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en, fr } from "../tontine/textes.js";
import * as dico from "../i18n/dictionnaires.js";

// Frontières de mot Unicode (\b ignore les lettres accentuées).
const INTERDITS_FR = /(?<!\p{L})(épargnes?|soldes?|retraits?|débitée?s?|sécurisée?s?|garantie?s?)(?!\p{L})/iu;
const INTERDITS_EN = /(?<!\p{L})(savings|balances?|withdrawals?|debited|secured?|guaranteed?|guarantees?)(?!\p{L})/iu;

function valeurs(o: unknown): string[] {
  if (typeof o === "string") return [o];
  if (o && typeof o === "object") return Object.values(o as Record<string, unknown>).flatMap(valeurs);
  return [];
}

describe("vocabulaire des textes affichés", () => {
  it("la garde reconnaît les mots visés, accents compris, sans faux positif", () => {
    expect(["Sécurisé", "votre solde", "Retrait", "Your balance", "SECURE"].every((t) => INTERDITS_FR.test(t) || INTERDITS_EN.test(t))).toBe(true);
    expect(["Confidentiel", "consolider", "soldat", "rebalancer", "insécurité"].some((t) => INTERDITS_FR.test(t) || INTERDITS_EN.test(t))).toBe(false);
  });
  it("aucun mot bancaire trompeur dans les textes de l'espace tontine", () => {
    expect(valeurs(fr).filter((t) => INTERDITS_FR.test(t))).toEqual([]);
    expect(valeurs(en).filter((t) => INTERDITS_EN.test(t))).toEqual([]);
  });
  it("aucun mot bancaire trompeur dans les dictionnaires de l'application", () => {
    const tous = valeurs(dico);
    expect(tous.filter((t) => INTERDITS_FR.test(t) || INTERDITS_EN.test(t))).toEqual([]);
  });
  it("aucun mot bancaire trompeur sur le site public, en français comme en anglais (A16)", () => {
    const site = resolve(__dirname, "../../../../apps/site");
    const pages = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (["node_modules", "dist", "public", "src", "scripts"].includes(n)) return [];
        return statSync(p).isDirectory() ? pages(p) : n.endsWith(".html") ? [p] : [];
      });
    const fichiers = pages(site);
    expect(fichiers.length).toBeGreaterThan(20);
    const fautes = fichiers.flatMap((f) => {
      const texte = readFileSync(f, "utf8").replace(/<[^>]*>/g, " ");
      const anglais = f.includes("/en/") || f.endsWith(".en.html");
      const m = texte.match(anglais ? INTERDITS_EN : INTERDITS_FR);
      return m ? [`${f.slice(site.length)} : ${m[0]}`] : [];
    });
    expect(fautes).toEqual([]);
  });
});
