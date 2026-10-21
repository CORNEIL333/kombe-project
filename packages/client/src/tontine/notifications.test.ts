import { describe, expect, it } from "vitest";
import type { NotificationView } from "@kombe/domain";
import { ongletDe, texteNotification } from "./notifications.js";
import { fr, remplir } from "./textes.js";

const o = {
  dyn: (cle: string, v?: Record<string, string | number>) => remplir((fr as Record<string, string>)[cle] ?? cle, v),
  instant: (iso: string | null | undefined) => (iso ? `«${iso.slice(0, 10)}»` : "—"),
  date: (iso: string | null | undefined) => (iso ? `[${iso}]` : "—"),
  xaf: (m: string) => `${m} FCFA`,
};
const n = (kind: string, params: NotificationView["params"], target: string | null = null): NotificationView => ({
  notificationId: "1",
  groupId: "grp_1",
  groupName: "Njangi Bépanda",
  kind,
  target,
  params,
  createdAt: "2026-10-20T10:00:00Z",
  read: false,
});

describe("notifications cliquables", () => {
  it("ouvre l'onglet concerné", () => {
    expect(ongletDe(n("statutes_published", null, "/tontines/grp_1/statuts"))).toBe("statuts");
    expect(ongletDe(n("cycle_started", null, "/tontines/grp_1/calendrier"))).toBe("tours");
    expect(ongletDe(n("aid_requested", null, "/tontines/grp_1/secours"))).toBe("discipline");
    expect(ongletDe(n("meeting_opened", null, "/tontines/grp_1/seances/mt_1"))).toBe("seances");
    expect(ongletDe(n("admitted", null, "/tontines/grp_1"))).toBeNull();
    expect(ongletDe(n("rejected", null, null))).toBeNull();
  });

  it("titre précis par palier et détail tiré des paramètres", () => {
    const r = texteNotification(n("statutes_reminder", { stage: "h6", deadlineAt: "2026-10-27T18:00:00Z", groupName: "Njangi Bépanda" }), o);
    expect(r.titre).toBe("Dernières heures pour accepter les statuts");
    expect(r.detail).toBe("Njangi Bépanda · échéance : «2026-10-27»");
    const d = texteNotification(n("due_reminder", { stage: "j1", roundSeq: 3, remaining: "5000", deadlineTime: "18:00" }), o);
    expect(d.titre).toBe("Cotisation à verser demain");
    expect(d.detail).toBe("Njangi Bépanda · tour 3 · reste 5000 FCFA · avant 18:00");
  });

  it("retire les morceaux sans donnée au lieu d'afficher « {x} »", () => {
    const d = texteNotification(n("meeting_reminder", { stage: "j0", date: "2026-10-21" }), o);
    expect(d.titre).toBe("Séance aujourd'hui");
    expect(d.detail).toBe("Njangi Bépanda · [2026-10-21]");
    expect(texteNotification(n("statutes_expired", { excluded: false, reason: "keep", name: "Chantal" }), o).detail).toBe(
      "Chantal n'a pas accepté · reste membre (votre choix)",
    );
  });

  it("type inconnu : libellé lisible, jamais vide", () => {
    expect(texteNotification(n("quelque_chose", null), o).titre).toBe("Quelque chose");
  });
});
