/**
 * Recette du CONTRAT C00 : docs/openapi.yaml est un artefact chargé et vérifié,
 * pas un vœu. On contrôle qu'il se parse, que les routes « A19 » absentes du
 * dossier v1 y figurent, et que la monnaie y est un entier (aucun flottant).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const openapiPath = resolve(here, "../../../docs/openapi.yaml");
const doc = yaml.load(readFileSync(openapiPath, "utf8")) as {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, { type?: string; format?: string; minimum?: unknown; maximum?: unknown }> };
};

describe("openapi.yaml — contrat C00", () => {
  it("se parse et declare OpenAPI 3.1.x", () => {
    expect(typeof doc.openapi).toBe("string");
    expect(doc.openapi.startsWith("3.1")).toBe(true);
  });

  it("expose les routes A19 absentes du dossier v1", () => {
    const a19 = [
      "/commands/{commandId}",
      "/groups/{groupId}/role-nominations",
      "/role-nominations/{nominationId}/acceptances",
      "/groups/{groupId}/role-change-requests",
      "/role-change-requests/{requestId}/approvals",
      "/proposals/{proposalId}/closures",
      "/proposals/{proposalId}/cancellations",
      "/disputes/{disputeId}/reopenings",
      "/disbursements/{disbursementId}/reversal-requests",
      "/disbursements/{disbursementId}/reversals",
      "/rounds/{roundId}/closures",
    ];
    for (const path of a19) {
      expect(doc.paths[path], `route manquante : ${path}`).toBeDefined();
    }
  });

  it("Money est un entier borne, jamais un flottant", () => {
    const money = doc.components.schemas.Money;
    expect(money.type).toBe("integer");
    expect(money.minimum).toBe(0);
    expect(money.maximum).toBe(9007199254740991);
  });

  it("les routes futures interdites au pilote ne sont pas exposees", () => {
    const paths = Object.keys(doc.paths).join(" ");
    expect(paths).not.toMatch(/wallet|loan|scoring|insurance/i);
  });
});
