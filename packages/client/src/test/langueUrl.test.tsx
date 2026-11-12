/* KÓMBE — A16 : arrivée depuis le site en anglais (`/?lang=en`) : la PWA
   s'ouvre en anglais et retient ce choix ; un paramètre inconnu est ignoré. */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FournisseurLangue, useLangue } from "../i18n/ContexteLangue.js";

function Langue() {
  return <p>{useLangue().langue}</p>;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.removeItem("kombe.langue");
});

describe("A16 : langue demandée par l'adresse", () => {
  it("?lang=en ouvre en anglais et retient le choix", () => {
    window.history.replaceState(null, "", "/?lang=en#/inscription");
    render(<FournisseurLangue><Langue /></FournisseurLangue>);
    expect(screen.getByText("en")).toBeTruthy();
    expect(window.localStorage.getItem("kombe.langue")).toBe("en");
  });

  it("sans paramètre ou paramètre inconnu : la langue gardée, sinon le français", () => {
    window.history.replaceState(null, "", "/?lang=de");
    render(<FournisseurLangue><Langue /></FournisseurLangue>);
    expect(screen.getByText("fr")).toBeTruthy();
  });
});
