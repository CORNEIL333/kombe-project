import { describe, expect, it } from "vitest";
import { destinationNotification, entreeNotification } from "../tontine/notifications.js";
import { en, fr } from "../tontine/textes.js";
import { ecrireRoute, lireRoute } from "../App.js";

describe("notifications : libellé exact et destination contrôlée", () => {
  it("une déclaration à confirmer mène à la file des validations", () => {
    expect(entreeNotification({ topic: "declared" }).cle).toBe("nt.declared");
    expect(destinationNotification({ topic: "declared", groupId: "g1" })).toEqual({ ecran: "validations" });
  });

  it("une amende mène à l'onglet Discipline du BON groupe", () => {
    const d = destinationNotification({ topic: "fine", groupId: "g7" });
    expect(d).toEqual({ ecran: "groupe", groupId: "g7", onglet: "discipline" });
    // La destination est une vraie route du PWA (lien direct, retour navigateur).
    expect(lireRoute(ecrireRoute(d as never))).toEqual(d);
  });

  it("nature inconnue : libellé générique honnête, aperçu du groupe", () => {
    expect(entreeNotification({ topic: "inconnu" }).cle).toBe("nt.autre");
    expect(destinationNotification({ topic: "inconnu", groupId: "g1" })).toEqual({ ecran: "groupe", groupId: "g1", onglet: "apercu" });
    expect(destinationNotification({ topic: "inconnu", groupId: null })).toBeNull();
  });

  it("serveur sans `topic` : repli sur la catégorie, jamais vide", () => {
    expect(entreeNotification({ kind: "meeting_reminder" }).cle).toBe("notif.meeting_reminder");
  });

  it("chaque libellé existe en français et en anglais", () => {
    for (const topic of ["declared", "toControl", "rejected", "due", "payout", "decision", "fine", "aid", "meetingSoon", "statutes", "join", "swap-ready"]) {
      const cle = entreeNotification({ topic }).cle;
      expect(fr[cle]).toBeTruthy();
      expect(en[cle]).toBeTruthy();
    }
  });
});
