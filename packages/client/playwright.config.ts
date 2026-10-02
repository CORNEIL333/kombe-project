/* KÓMBE C14 — configuration Playwright. Elle raccorde une vraie exécution E2E :
   un serveur `vite preview` sert le bundle `dist/` (généré par le build) et
   Chromium (révision 1243, présente localement) conduit le parcours. Separate de
   `pnpm -r test` (vitest/jsdom) pour que la suite unitaire reste rapide et
   déterministe ; `test:e2e` construit puis lance ces scénarios navigateur. */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Sert le build de production (dist/) — le même artefact que celui livré.
    command: "node node_modules/vite/bin/vite.js preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
