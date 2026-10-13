/** Le build de l'API annonce le dernier jalon de schéma qu'il attend : il doit
 *  être le dernier fichier de migration du dépôt ET figurer dans le runner. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_LATEST_MIGRATION } from "../src/ops/opsRoutes.js";

const db = resolve(__dirname, "../../db");

describe("jalon de schéma attendu par l'API", () => {
  it("= dernière migration du dépôt, listée par migrate.mjs", () => {
    const ups = readdirSync(resolve(db, "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql")).sort();
    expect(`migrations/${ups[ups.length - 1]}`).toBe(EXPECTED_LATEST_MIGRATION);
    expect(readFileSync(resolve(db, "scripts/migrate.mjs"), "utf8")).toContain(`"${EXPECTED_LATEST_MIGRATION}"`);
  });
});
