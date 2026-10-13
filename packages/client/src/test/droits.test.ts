/* La copie PWA de la matrice des droits doit rester identique au domaine. */
import { describe, expect, it } from "vitest";
import { GROUP_ROLES, TONTINE_ACTIONS, canAct } from "@kombe/domain";
import { peut } from "../tontine/droits.js";

describe("droits PWA = matrice du domaine", () => {
  it("chaque (rôle, action) donne le même verdict", () => {
    for (const action of TONTINE_ACTIONS) {
      for (const role of GROUP_ROLES) {
        expect(peut([role], action), `${role} / ${action}`).toBe(canAct([role], action));
      }
    }
  });
});
