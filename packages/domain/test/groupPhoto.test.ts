import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DomainError, assertCanAct, cleanGroupPhoto } from "../src/index.js";

const lire = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "fixtures", n)));
const contient = (a: Uint8Array, texte: string) => Buffer.from(a).includes(Buffer.from(texte));
const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof DomainError ? e.code : String(e);
  }
  return "OK";
};

describe("photo de groupe : validation stricte côté serveur", () => {
  it("JPEG carré valide : accepté, métadonnées EXIF/GPS et commentaires retirés", () => {
    const brut = lire("photo_512_exif.jpg");
    expect(contient(brut, "TelephoneSecret")).toBe(true);
    expect(contient(brut, "secret gps")).toBe(true);
    const propre = cleanGroupPhoto(brut, 512);
    expect(contient(propre, "TelephoneSecret")).toBe(false);
    expect(contient(propre, "GPS-4.05N")).toBe(false);
    expect(contient(propre, "secret gps")).toBe(false);
    // Reste un JPEG complet (SOI … EOI) et plus léger.
    expect([propre[0], propre[1]]).toEqual([0xff, 0xd8]);
    expect([propre[propre.length - 2], propre[propre.length - 1]]).toEqual([0xff, 0xd9]);
    expect(propre.length).toBeLessThan(brut.length);
    // Idempotent : nettoyer deux fois ne change plus rien.
    expect(Buffer.from(cleanGroupPhoto(propre, 512)).equals(Buffer.from(propre))).toBe(true);
  });

  it("taille de variante vérifiée sur l'en-tête réel (pas sur la déclaration du client)", () => {
    expect(code(() => cleanGroupPhoto(lire("photo_256.jpg"), 256))).toBe("OK");
    expect(code(() => cleanGroupPhoto(lire("photo_256.jpg"), 512))).toBe("PHOTO_INVALID");
    expect(code(() => cleanGroupPhoto(lire("photo_300.jpg"), 256))).toBe("PHOTO_INVALID");
  });

  it("refuse PNG, SVG (script), fichier vide, tronqué ou surdimensionné", () => {
    expect(code(() => cleanGroupPhoto(lire("photo_256.png"), 256))).toBe("PHOTO_INVALID");
    expect(code(() => cleanGroupPhoto(lire("photo.svg"), 256))).toBe("PHOTO_INVALID");
    expect(code(() => cleanGroupPhoto(new Uint8Array(0), 256))).toBe("PHOTO_INVALID");
    const ok = lire("photo_256.jpg");
    expect(code(() => cleanGroupPhoto(ok.subarray(0, ok.length - 40), 256))).toBe("PHOTO_INVALID");
    const enorme = new Uint8Array(200_000);
    enorme.set(ok);
    expect(code(() => cleanGroupPhoto(enorme, 256))).toBe("PHOTO_INVALID");
  });

  it("contenu malformé (longueur de segment mensongère) : refusé sans planter", () => {
    const m = new Uint8Array(lire("photo_256.jpg"));
    m[4] = 0xff;
    m[5] = 0xff;
    expect(code(() => cleanGroupPhoto(m, 256))).toBe("PHOTO_INVALID");
  });

  it("seuls présidence et secrétariat changent la photo (moindre privilège)", () => {
    expect(code(() => assertCanAct(["animator"], "group.photo"))).toBe("OK");
    expect(code(() => assertCanAct(["vice_president"], "group.photo"))).toBe("OK");
    expect(code(() => assertCanAct(["secretary"], "group.photo"))).toBe("OK");
    for (const r of ["member", "treasurer", "treasurer_deputy", "auditor", "censor", "advisor"] as const) {
      expect(code(() => assertCanAct([r], "group.photo"))).not.toBe("OK");
    }
  });
});
