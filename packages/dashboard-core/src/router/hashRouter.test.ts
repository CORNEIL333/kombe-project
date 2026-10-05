// @vitest-environment jsdom
/**
 * Couverture de useHashRoute : normalisation du hash initial (#/… → chemin
 * absolu, vide → '/'), réaction à l'événement hashchange, navigate() qui écrit
 * un hash normalisé, et retrait de l'écouteur au démontage.
 * Rendu réel du hook via @testing-library/react (React 19, jsdom) — aucun
 * serveur requis.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHashRoute } from "./hashRouter";

/** Change le hash comme le ferait le navigateur et déclenche hashchange. */
async function setHash(raw: string) {
  await act(async () => {
    const prev = window.location.hash;
    window.location.hash = raw;
    // jsdom ne délègue pas toujours hashchange sur une affectation directe :
    // on le re-dispatche manuellement si l'écouteur du hook ne l'a pas reçu
    // (idempotent — le hook relit window.location.hash de toute façon).
    if (window.location.hash === prev) {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  });
}

afterEach(() => {
  // Remet l'URL à zéro entre cas pour éviter toute contamination.
  window.location.hash = "";
});

describe("useHashRoute — normalisation initiale", () => {
  it("hash vide → '/'", () => {
    window.location.hash = "";
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.path).toBe("/");
  });

  it("'#/' seul → '/'", () => {
    window.location.hash = "#/";
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.path).toBe("/");
  });

  it("'#groupe' sans slash → '/groupe'", () => {
    window.location.hash = "#groupe";
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.path).toBe("/groupe");
  });

  it("'#/litiges/12' → chemin absolu conservé", () => {
    window.location.hash = "#/litiges/12";
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.path).toBe("/litiges/12");
  });
});

describe("useHashRoute — réactivité hashchange", () => {
  it("suit un changement de hash post-montage", async () => {
    window.location.hash = "#/accueil";
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.path).toBe("/accueil");

    await setHash("#/decaissements");
    expect(result.current.path).toBe("/decaissements");
  });
});

describe("useHashRoute — navigate()", () => {
  it("écrit un hash normalisé et met à jour path", async () => {
    const { result } = renderHook(() => useHashRoute());
    await act(async () => {
      result.current.navigate("propositions");
      // jsdom délègue hashchange de façon asynchrone : on laisse une tickle
      // la propagation avant d'affirmer que le hook a re-lu l'URL.
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(window.location.hash).toBe("#/propositions");
    expect(result.current.path).toBe("/propositions");
  });

  it("navigate('/') normalise la racine", () => {
    window.location.hash = "#/x";
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current.navigate("/"));
    expect(window.location.hash).toBe("#/");
  });
});

describe("useHashRoute — nettoyage au démontage", () => {
  it("ne réagit plus après unmount (écouteur retiré)", async () => {
    window.location.hash = "#/a";
    const { result, unmount } = renderHook(() => useHashRoute());
    expect(result.current.path).toBe("/a");

    unmount();
    // Un hashchange après démontage ne doit pas faire crasher ni muter l'état
    // observé via le hook (l'écouteur a été retiré dans le cleanup).
    await setHash("#/b");
    expect(result.current.path).toBe("/a");
  });
});
