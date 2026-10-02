/* KÓMBE C15 — scénario E2E réel : le bandeau d'état suit la connectivité RÉELLE
   du navigateur. On coupe le réseau via l'API d'émulation de Playwright
   (`context.setOffline(true)`), ce qui met `navigator.onLine` à false et déclenche
   l'événement `offline` ; le bandeau doit alors afficher l'état hors-ligne et ne
   JAMAIS revendiquer une validation serveur (C15-OFFLINE côté UX). Remettre le
   réseau restaure l'état en ligne. */

import { expect, test } from "@playwright/test";

test("couper le réseau bascule le bandeau en hors-ligne sans fausse validation (C15)", async ({
  page,
}) => {
  await page.goto("/");

  // En ligne au départ : le bandeau (classe dédiée, unique sur la page) n'évoque
  // pas « hors ligne ». On cible `.bandeau` pour lever l'ambiguïté avec
  // l'indicateur d'étape du parcours (qui est aussi role="status").
  const bandeau = page.locator(".bandeau");
  await expect(bandeau).toBeVisible();
  await expect(bandeau).not.toContainText(/Hors ligne/i);

  // Coupure réseau réelle émulée → événement `offline` → React met à jour l'UI.
  await page.context().setOffline(true);
  await expect(page.locator(".bandeau")).toContainText(/Hors ligne/i);
  // L'UX ne prétend jamais qu'une soumission hors-ligne est validée par le serveur.
  await expect(page.locator(".bandeau")).not.toContainText(/validé par le serveur/i);

  // Retour du réseau → l'état en ligne revient.
  await page.context().setOffline(false);
  await expect(page.locator(".bandeau")).not.toContainText(/Hors ligne/i);
});
