import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkContrast, contrast } from "./build-tokens.mjs";

const t = JSON.parse(readFileSync(new URL("../tokens/kombe.tokens.json", import.meta.url), "utf8"));

test("toutes les paires texte requises atteignent WCAG 2.2 AA", () => {
  for (const r of checkContrast(t)) assert.ok(r.ok, `${r.fg} sur ${r.bg} = ${r.ratio} < ${r.min}`);
});

test("l'or n'est jamais un texte courant sur fond clair (règle de charte)", () => {
  assert.ok(contrast(t.semantic.accent, t.semantic["surface-canvas"]) < 4.5);
});

test("les valeurs de charte sont conservées", () => {
  assert.equal(t.semantic.brand, "#103C32");
  assert.equal(t.semantic.accent, "#C7922E");
  assert.equal(t.semantic["surface-canvas"], "#FBF8F1");
  assert.equal(t.semantic["content-primary"], "#13211C");
});
