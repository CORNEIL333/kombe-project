import { describe, expect, it } from "vitest";
import { initiales } from "../tontine/PhotoGroupe.js";
import { peut } from "../tontine/droits.js";

describe("photo de groupe (PWA)", () => {
  it("initiales sans articles, repli sûr", () => {
    expect(initiales("Les Étoiles de Yaoundé")).toBe("ÉY");
    expect(initiales("Solidarité Bamiléké")).toBe("SB");
    expect(initiales("Njangi")).toBe("N");
    expect(initiales("  ")).toBe("K");
  });
  it("bouton « Modifier la photo » : présidence et secrétariat seulement (miroir du serveur)", () => {
    expect(peut(["animator"], "group.photo")).toBe(true);
    expect(peut(["secretary"], "group.photo")).toBe(true);
    expect(peut(["treasurer"], "group.photo")).toBe(false);
    expect(peut(["member"], "group.photo")).toBe(false);
  });
});
