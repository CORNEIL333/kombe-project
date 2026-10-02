/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// KÓMBE C14 — build Vite + recette unitaire (vitest/jsdom). L'exécution E2E est
// portée par playwright.config.ts (test:e2e), volontairement séparée de `test`
// pour que `pnpm -r test` reste déterministe et rapide (jsdom, sans serveur).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
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
