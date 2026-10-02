/* KÓMBE C14 — amorçage vitest/jsdom. Étend `expect` avec les matchers
   jest-dom (toBeVisible, toHaveAccessibleName, etc.) et nettoie le DOM entre
   tests pour éviter toute fuite d'un render à l'autre. */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
