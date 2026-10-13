/* KÓMBE — PWA « tontine réelle ». Navigation par fragment (#/…) pour que les
   liens d'invitation WhatsApp (#/rejoindre/CODE) ouvrent directement le bon
   écran, même après la connexion. La session est gardée sur l'appareil. */

import { useCallback, useEffect, useState } from "react";
import { BasculeLangue } from "./i18n/ContexteLangue.js";
import { LogoKombe } from "./composants/Marque.js";
import { acces, memoriserSession, sessionMemorisee, type Session } from "./tontine/api.js";
import { ConnexionTelephone } from "./tontine/Connexion.js";
import { Accueil, Notifications } from "./tontine/Accueil.js";
import { Creation } from "./tontine/Creation.js";
import { Rejoindre } from "./tontine/Rejoindre.js";
import { Groupe } from "./tontine/Groupe.js";
import { useTextes } from "./tontine/textes.js";

export type Route =
  | { readonly ecran: "accueil" }
  | { readonly ecran: "creer" }
  | { readonly ecran: "notifications" }
  | { readonly ecran: "rejoindre"; readonly code?: string }
  | { readonly ecran: "groupe"; readonly groupId: string };

export function lireRoute(hash: string): Route {
  const parties = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [tete, arg] = parties;
  if (tete === "rejoindre") return arg ? { ecran: "rejoindre", code: arg.toUpperCase() } : { ecran: "rejoindre" };
  if (tete === "creer") return { ecran: "creer" };
  if (tete === "notifications") return { ecran: "notifications" };
  if (tete === "groupe" && arg) return { ecran: "groupe", groupId: arg };
  return { ecran: "accueil" };
}

export function ecrireRoute(r: Route): string {
  switch (r.ecran) {
    case "accueil":
      return "#/";
    case "creer":
      return "#/creer";
    case "notifications":
      return "#/notifications";
    case "rejoindre":
      return r.code ? `#/rejoindre/${encodeURIComponent(r.code)}` : "#/rejoindre";
    case "groupe":
      return `#/groupe/${encodeURIComponent(r.groupId)}`;
  }
}

function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setEnLigne(true);
    const off = () => setEnLigne(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return enLigne;
}

export function App() {
  const { tx } = useTextes();
  const [session, setSession] = useState<Session | null>(() => sessionMemorisee());
  const [route, setRoute] = useState<Route>(() => lireRoute(window.location.hash));
  const [nonLues, setNonLues] = useState(0);
  const enLigne = useEnLigne();

  useEffect(() => {
    const surHash = () => setRoute(lireRoute(window.location.hash));
    window.addEventListener("hashchange", surHash);
    return () => window.removeEventListener("hashchange", surHash);
  }, []);

  const aller = useCallback((r: Route) => {
    const h = ecrireRoute(r);
    if (window.location.hash !== h) window.location.hash = h;
    setRoute(r);
    window.scrollTo?.(0, 0);
  }, []);

  useEffect(() => {
    if (!session) return;
    let actif = true;
    const lire = () =>
      acces.notifications(session, true).then(
        (l) => actif && setNonLues(l.length),
        (e: unknown) => {
          if (actif && e && typeof e === "object" && (e as { status?: number }).status === 401) {
            memoriserSession(null);
            setSession(null);
          }
        },
      );
    void lire();
    const t = window.setInterval(lire, 60_000);
    return () => {
      actif = false;
      window.clearInterval(t);
    };
  }, [session, route]);

  const deconnecter = () => {
    if (session) void acces.deconnexion(session).catch(() => undefined);
    memoriserSession(null);
    setSession(null);
    aller({ ecran: "accueil" });
  };

  return (
    <div className="app app-tontine">
      <a href="#contenu" className="evitement" onClick={(e) => (e.preventDefault(), document.getElementById("contenu")?.focus())}>
        {tx("app.accueil")}
      </a>
      <header className="entete">
        <div className="entete-marque">
          <button type="button" className="lien-logo" onClick={() => aller({ ecran: "accueil" })} aria-label={tx("app.accueil")}>
            <LogoKombe hauteur={24} />
          </button>
        </div>
        <div className="entete-actions">
          {session ? (
            <>
              <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => aller({ ecran: "notifications" })}>
                {tx("app.notifications")}
                {nonLues > 0 ? (
                  <span className="compteur" aria-label={`${nonLues}`}>
                    {nonLues}
                  </span>
                ) : null}
              </button>
              <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={deconnecter}>
                {tx("app.deconnexion")}
              </button>
            </>
          ) : null}
          <BasculeLangue />
        </div>
      </header>
      {enLigne ? null : (
        <p className="bandeau bandeau--horsLigne" role="status">
          {tx("app.horsLigne")}
        </p>
      )}
      <main id="contenu" tabIndex={-1} className="contenu-tontine">
        {!session ? (
          <ConnexionTelephone
            onConnecte={(s) => {
              setSession(s);
              setRoute(lireRoute(window.location.hash));
            }}
          />
        ) : route.ecran === "creer" ? (
          <Creation session={session} onCree={(groupId) => aller({ ecran: "groupe", groupId })} onAnnuler={() => aller({ ecran: "accueil" })} />
        ) : route.ecran === "rejoindre" ? (
          <Rejoindre session={session} {...(route.code ? { codeInitial: route.code } : {})} onFini={() => aller({ ecran: "accueil" })} />
        ) : route.ecran === "notifications" ? (
          <Notifications session={session} onOuvrir={(groupId) => aller({ ecran: "groupe", groupId })} />
        ) : route.ecran === "groupe" ? (
          <Groupe key={route.groupId} session={session} groupId={route.groupId} onRetour={() => aller({ ecran: "accueil" })} />
        ) : (
          <Accueil
            session={session}
            onOuvrir={(groupId) => aller({ ecran: "groupe", groupId })}
            onCreer={() => aller({ ecran: "creer" })}
            onRejoindre={() => aller({ ecran: "rejoindre" })}
          />
        )}
      </main>
      <footer className="pied-page">
        <p className="pied-page__promesse">{tx("app.positionnement")}</p>
      </footer>
    </div>
  );
}
