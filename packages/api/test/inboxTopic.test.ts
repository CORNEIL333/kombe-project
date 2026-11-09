import { describe, expect, it } from "vitest";
import { topicOf } from "../src/tontine/inbox.js";

describe("notification : nature et objet tirés de la clé de dédoublonnage", () => {
  it("rejet d'un mouvement : topic + objet, jamais l'identité destinataire", () => {
    expect(topicOf("rejected:mv_12:+237677123456")).toEqual({ topic: "rejected", subjectId: "mv_12" });
  });
  it("clé sans objet (cycle d'un groupe) : objet nul", () => {
    expect(topicOf("statutes:awa@example.cm")).toEqual({ topic: "statutes", subjectId: null });
  });
  it("objet non conforme ignoré", () => {
    expect(topicOf("due:3:late:+2376")).toEqual({ topic: "due", subjectId: "3" });
    expect(topicOf("x:a b:+2376")).toEqual({ topic: "x", subjectId: null });
  });
});
