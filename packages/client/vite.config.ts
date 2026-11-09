/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { logoSvg } from "../brand/icons/logo-svg";

/* Téléphones du terrain (Cameroun) : beaucoup d'Android dont Chrome n'est plus
   mis à jour, et d'iPhone bloqués en iOS 14–15. Un seul bundle, abaissé à
   Chrome 67 / Safari 14 — plancher imposé par les BigInt des montants — avec
   les polyfills nécessaires (core-js à la demande). Aucun script en ligne : la
   CSP stricte reste intacte. Plus ancien : public/demarrage.js affiche un
   message clair au lieu d'un écran figé. */
export const CIBLES_TERRAIN = ["chrome >= 67", "and_chr >= 67", "safari >= 14", "ios_saf >= 14", "samsung >= 9", "firefox >= 68", "edge >= 79", "opera >= 54"];

// KÓMBE C14 — build Vite + recette unitaire (vitest/jsdom). L'exécution E2E est
// portée par playwright.config.ts (test:e2e), volontairement séparée de `test`
// pour que `pnpm -r test` reste déterministe et rapide (jsdom, sans serveur).
export default defineConfig({
  plugins: [
    // Écran d'ouverture : le logo animé de la charte est injecté en SVG statique.
    { name: "kombe-ouverture", transformIndexHtml: (html: string) => html.replace("<!--@logo-anime-->", logoSvg({ signature: true, anime: true })) },
    react(),
    legacy({ renderLegacyChunks: false, modernTargets: CIBLES_TERRAIN, modernPolyfills: true }),
  ],
  server: {
    port: 5173,
    // Dév local : le navigateur appelle la PWA sur :5173 ; `/v1` est relayé
    // vers l'API réelle sur :3000 (même origine → aucune prérequête CORS).
    proxy: { "/v1": { target: "http://localhost:3000", changeOrigin: true } },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Pas de sourcemaps publiés : le site est public, le bundle suffit aux erreurs terrain.
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
