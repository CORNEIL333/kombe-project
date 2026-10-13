/**
 * Règle de copie (I-01, I-08) appliquée à l'API produit : tout motif
 * d'erreur et tout libellé de src/tontine est montré tel quel à la personne,
 * donc aucun mot interdit (épargne, solde, retrait, « validé par le serveur »…).
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { forbiddenCopyIn } from "@kombe/domain";

const dir = resolve(__dirname, "../src/tontine");

function stringsOf(source: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (let m = re.exec(source); m; m = re.exec(source)) out.push(m[1] ?? m[2] ?? "");
  return out.filter((s) => /[a-zà-ÿ]{3,}\s/i.test(s) && !/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(s));
}

describe("copie produit de l'API tontine", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    it(`${file} n'affiche aucun mot interdit`, () => {
      const found = stringsOf(readFileSync(resolve(dir, file), "utf8"))
        .map((s) => ({ s, hits: forbiddenCopyIn(s) }))
        .filter((x) => x.hits.length > 0);
      expect(found).toEqual([]);
    });
  }
});
