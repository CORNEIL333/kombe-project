/**
 * A13 — motifs d'erreur en anglais. Chaque motif que les routes produit
 * (auth, me, tontines, invitations) peuvent renvoyer doit avoir sa version
 * anglaise : on relit les sources plutôt que de tenir une liste à la main.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ERRORS_EN, localizeMessage, prefersEnglish } from "../src/i18n/errorsEn.js";
import { buildApp } from "../src/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgs = resolve(here, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

const sources = [
  ...walk(join(pkgs, "api/src/tontine")),
  ...walk(join(pkgs, "domain/src/tontine")),
  ...["api/src/server.ts", "api/src/httpGuards.ts", "domain/src/identity.ts", "domain/src/money.ts"].map((f) => join(pkgs, f)),
].filter((f) => existsSync(f));

const plain = new Set<string>();
const templates = new Set<string>();
const re = /new DomainError\(\s*"[A-Z_]+"\s*,\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/gs;
for (const f of sources) {
  for (const m of readFileSync(f, "utf8").matchAll(re)) {
    if (m[1] !== undefined) plain.add(m[1]);
    else if (m[2] !== undefined) templates.add(m[2]);
  }
}

describe("A13 — motifs d'erreur en anglais", () => {
  it("relit bien les sources (garde contre un balayage vide)", () => {
    expect(plain.size).toBeGreaterThan(300);
    expect(templates.size).toBeGreaterThan(10);
  });

  it("chaque motif fixe des routes produit a sa version anglaise", () => {
    const missing = [...plain].filter((m) => ERRORS_EN[m] === undefined);
    expect(missing).toEqual([]);
  });

  it("chaque gabarit, une fois rempli, est rendu en anglais", () => {
    const untranslated = [...templates]
      .map((t) => t.replace(/\$\{[^}]*\}/g, "7"))
      // Gabarit imbriqué (relance des statuts) : coupé par le balayage, il a son test dédié ci-dessous.
      .filter((sample) => !sample.includes("${"))
      .filter((sample) => localizeMessage(sample, "en") === sample);
    expect(untranslated).toEqual([]);
  });

  it("les relances de statuts traduisent aussi l'échéance", () => {
    const fr =
      "Statuts pas encore acceptés par : Awa, Paul. Relancez-les depuis l'onglet Statuts. Échéance : 5 novembre — passé ce délai, les retardataires sont traités selon votre choix (exclusion ou signalement).";
    expect(localizeMessage(fr, "en")).toBe(
      "Rules not yet accepted by: Awa, Paul. Remind them from the Rules tab. Deadline: 5 November — after that, latecomers are handled as you chose (exclusion or report).",
    );
  });

  it("français par défaut ; anglais seulement si c'est la première langue demandée", () => {
    expect(prefersEnglish(undefined)).toBe(false);
    expect(prefersEnglish("fr-CM,fr;q=0.9,en;q=0.8")).toBe(false);
    expect(prefersEnglish("en")).toBe(true);
    expect(prefersEnglish("en-GB,en;q=0.9")).toBe(true);
    expect(localizeMessage("Code invalide", "fr")).toBe("Code invalide");
    expect(localizeMessage("Code invalide", "en")).toBe("Invalid code");
    expect(localizeMessage("Motif inconnu de la table", "en")).toBe("Motif inconnu de la table");
  });

  it("aucun mot qui ferait croire que KÓMBE tient l'argent", () => {
    const words = /\b(savings?|balance|withdraw\w*|debited|secured|guaranteed)\b/i;
    expect(Object.values(ERRORS_EN).filter((v) => words.test(v))).toEqual([]);
  });

  it("le gestionnaire d'erreurs répond dans la langue demandée", async () => {
    const app = buildApp({});
    const ask = (lang?: string) =>
      app.inject({
        method: "POST",
        url: "/v1/access/registrations",
        headers: { "content-type": "application/json", ...(lang ? { "accept-language": lang } : {}) },
        payload: { identityId: 42 },
      });
    const fr = await ask();
    const en = await ask("en-GB,en;q=0.9");
    expect(fr.statusCode).toBeGreaterThanOrEqual(400);
    expect(en.statusCode).toBe(fr.statusCode);
    expect(en.json().code).toBe(fr.json().code);
    expect(fr.json().message).toMatch(/^Requête/);
    expect(en.json().message).toBe(ERRORS_EN[fr.json().message as string]);
  });
});
