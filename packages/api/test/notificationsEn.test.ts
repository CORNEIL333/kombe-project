/** A15 — textes génériques hors application : chaque type a sa version
 *  anglaise, sans nom ni montant, et sans mot qui ferait croire que KÓMBE
 *  tient l'argent. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { genericText } from "../src/tontine/delivery.js";

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/tontine/delivery.ts"), "utf8");
const bloc = src.slice(src.indexOf("const TITRES:"), src.indexOf("};", src.indexOf("const TITRES:")));
const kinds = [...bloc.matchAll(/^ {2}([a-z_]+): "/gm)].map((m) => m[1]!);

describe("A15 — textes hors application en anglais", () => {
  it("relit bien les types", () => expect(kinds.length).toBeGreaterThan(30));

  it("chaque type a son propre titre anglais", () => {
    const fallback = genericText("general", "en").title;
    expect(kinds.filter((k) => k !== "general" && genericText(k, "en").title === fallback)).toEqual([]);
    for (const k of kinds) expect(genericText(k, "en").title).not.toBe(genericText(k, "fr").title);
  });

  it("français par défaut", () => {
    expect(genericText("due_reminder")).toEqual({ title: "Cotisation à déclarer", body: "Ouvrez KÓMBE pour voir le détail." });
    expect(genericText("due_reminder", "en")).toEqual({ title: "Contribution to declare", body: "Open KÓMBE to see the details." });
  });

  it("aucun mot interdit", () => {
    const words = /\b(savings?|balance|withdraw\w*|debited|secured|guaranteed)\b/i;
    expect(kinds.map((k) => genericText(k, "en").title).filter((t) => words.test(t))).toEqual([]);
  });
});
