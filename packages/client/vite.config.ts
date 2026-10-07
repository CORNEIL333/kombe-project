/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// KÓMBE C14 — build Vite + recette unitaire (vitest/jsdom). L'exécution E2E est
// portée par playwright.config.ts (test:e2e), volontairement séparée de `test`
// pour que `pnpm -r test` reste déterministe et rapide (jsdom, sans serveur).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dév local : le navigateur appelle la PWA sur :5173 ; `/v1` est relayé
    // vers l'API réelle sur :3000 (même origine → aucune prérequête CORS).
    proxy: { "/v1": { target: "http://localhost:3000", changeOrigin: true } },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
