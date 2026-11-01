/* KÓMBE — PWA « tontine réelle ». Navigation par fragment (#/…) pour que les
   liens d'invitation WhatsApp (#/rejoindre/CODE) ouvrent directement le bon
   écran, même après la connexion. La session est gardée sur l'appareil. */

import { useCallback, useEffect, useState } from "react";
import { SelecteurLangue, useLangue } from "./i18n/ContexteLangue.js";
import { LogoCompose, LogoKombe } from "./composants/Marque.js";
import { acces, memoriserSession, sessionMemorisee, type Session } from "./tontine/api.js";
import { ConnexionTelephone } from "./tontine/Connexion.js";
import { Accueil, Notifications } from "./tontine/Accueil.js";
import { oublierGroupeActif, useGroupeActif } from "./tontine/groupeActif.js";
import { MenuLateral, SelecteurGroupe } from "./tontine/Coquille.js";
import { Creation } from "./tontine/Creation.js";
import { Rejoindre } from "./tontine/Rejoindre.js";
import { Groupe } from "./tontine/Groupe.js";
import { useTextes } from "./tontine/textes.js";
import { FileAttente } from "./tontine/FileAttente.js";
import { lireFile } from "./tontine/fileAttenteMoteur.js";
import { Icone, type NomIcone } from "./composants/Icones.js";
import { Profil } from "./tontine/Profil.js";
import { MesCotisations } from "./tontine/MesCotisations.js";
import { Validations } from "./tontine/Validations.js";
import { Aide } from "./tontine/Aide.js";
import { Documents } from "./tontine/Documents.js";
import { estBureau, ouvrirBureau } from "./tontine/bureau.js";

export type Route =
  | { readonly ecran: "accueil" }
  | { readonly ecran: "creer" }
  | { readonly ecran: "notifications" }
  | { readonly ecran: "profil" }
  | { readonly ecran: "cotisations" }
  | { readonly ecran: "validations" }
  | { readonly ecran: "aide" }
  | { readonly ecran: "documents" }
  | { readonly ecran: "rejoindre"; readonly code?: string }
  | { readonly ecran: "groupe"; readonly groupId: string; readonly onglet?: string };

export function lireRoute(hash: string): Route {
  const parties = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [tete, arg, sous] = parties;
  if (tete === "rejoindre") return arg ? { ecran: "rejoindre", code: arg.toUpperCase() } : { ecran: "rejoindre" };
  if (tete === "creer") return { ecran: "creer" };
  if (tete === "notifications") return { ecran: "notifications" };
  if (tete === "profil") return { ecran: "profil" };
  if (tete === "cotisations") return { ecran: "cotisations" };
  if (tete === "validations") return { ecran: "validations" };
  if (tete === "aide") return { ecran: "aide" };
  if (tete === "documents") return { ecran: "documents" };
  if (tete === "groupe" && arg) return sous ? { ecran: "groupe", groupId: arg, onglet: sous } : { ecran: "groupe", groupId: arg };
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
    case "profil":
      return "#/profil";
    case "cotisations":
      return "#/cotisations";
    case "validations":
      return "#/validations";
    case "aide":
      return "#/aide";
    case "documents":
      return "#/documents";
    case "rejoindre":
      return r.code ? `#/rejoindre/${encodeURIComponent(r.code)}` : "#/rejoindre";
    case "groupe":
      return `#/groupe/${encodeURIComponent(r.groupId)}${r.onglet ? `/${encodeURIComponent(r.onglet)}` : ""}`;
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
  const { t } = useLangue();
  const [session, setSession] = useState<Session | null>(() => sessionMemorisee());
  const [route, setRoute] = useState<Route>(() => lireRoute(window.location.hash));
  const [nonLues, setNonLues] = useState(0);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [choixGroupe, setChoixGroupe] = useState(false);
  const enLigne = useEnLigne();
  const groupes = useGroupeActif(session);

  useEffect(() => {
    const surHash = () => setRoute(lireRoute(window.location.hash));
    window.addEventListener("hashchange", surHash);
    return () => window.removeEventListener("hashchange", surHash);
  }, []);

  // Le fragment fait foi : précédent/suivant du navigateur, liens directs et
  // rechargement retrouvent le même écran.
  const aller = useCallback((r: Route) => {
    const h = ecrireRoute(r);
    if (window.location.hash !== h) window.location.hash = h;
    setRoute(r);
    setMenuOuvert(false);
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

  const actif = groupes.actif;
  const bureau = actif !== null && estBureau(actif.roles);

  // Déconnexion en deux temps : on confirme, et l'on prévient si des
  // opérations attendent encore le réseau sur ce téléphone.
  const [quitter, setQuitter] = useState(false);
  const enAttente = quitter ? lireFile().length : 0;
  const deconnecter = () => {
    if (session) void acces.deconnexion(session).catch(() => undefined);
    memoriserSession(null);
    oublierGroupeActif();
    setSession(null);
    setQuitter(false);
    aller({ ecran: "accueil" });
  };
  useEffect(() => {
    if (!quitter) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuitter(false);
    };
    window.addEventListener("keydown", echap);
    document.getElementById("quitter-annuler")?.focus();
    return () => window.removeEventListener("keydown", echap);
  }, [quitter]);

  const destinations: readonly (readonly [Route["ecran"] | "bureau", NomIcone, string])[] = [
    ["accueil", "accueil", tx("nav.accueil")],
    ["cotisations", "declarer", tx("nav.cotisations")],
    ["notifications", "cloche", tx("nav.activite")],
    ...(bureau ? ([["bureau", "bureau", tx("app.bureau")]] as const) : []),
  ];

  return (
    <div className={session ? "app app-tontine app--session" : "app app-tontine app--accueil"}>
      <a href="#contenu" className="evitement" onClick={(e) => (e.preventDefault(), document.getElementById("contenu")?.focus())}>
        {tx("app.accueil")}
      </a>
      {session ? (
        <header className="barre-haut">
          <button
            type="button"
            className="barre-haut__menu"
            aria-label={tx("sh.menu")}
            aria-expanded={menuOuvert}
            aria-controls="menu-lateral"
            onClick={() => setMenuOuvert(true)}
          >
            <Icone nom="menu" taille={24} />
          </button>
          <div className="barre-haut__titre">
            {actif ? (
              <button
                type="button"
                className="selecteur-groupe"
                aria-label={tx("sh.groupeActif", { nom: actif.name })}
                aria-haspopup="dialog"
                onClick={() => setChoixGroupe(true)}
              >
                <span className="selecteur-groupe__nom">{actif.name}</span>
                <Icone nom="chevron-bas" taille={18} />
              </button>
            ) : (
              <LogoKombe hauteur={30} />
            )}
          </div>
          <button
            type="button"
            className="barre-haut__cloche"
            aria-label={nonLues > 0 ? `${tx("nav.activite")}, ${nonLues}` : tx("nav.activite")}
            onClick={() => aller({ ecran: "notifications" })}
          >
            <Icone nom="cloche" taille={24} />
            {nonLues > 0 ? (
              <span className="compteur" aria-hidden="true">
                {nonLues > 99 ? "99+" : nonLues}
              </span>
            ) : null}
          </button>
        </header>
      ) : (
        <header className="entete">
          <div className="entete-marque">
            <button type="button" className="lien-logo" onClick={() => aller({ ecran: "accueil" })} aria-label={tx("app.accueil")}>
              <LogoCompose symbole={60} mot={34.3} signature={10.6} ecart={14} />
            </button>
          </div>
          {/* Avant connexion : la navigation du site (maquette « Connectez-vous »). */}
          <nav className="entete-site" aria-label={t("cx2.accueil")}>
            <a href="#/" aria-current="page">{t("cx2.accueil")}</a>
            <a href="/site/a-propos/">{t("cx2.aPropos")}</a>
            <a href="/site/#gestes">{t("cx2.fonctionnalites")}</a>
            <a href="/site/securite/">{t("cx2.securite")}</a>
            <a href="/site/#questions">{t("cx2.faq")}</a>
          </nav>
          <div className="entete-actions">
            <SelecteurLangue />
          </div>
        </header>
      )}
      {session ? (
        <MenuLateral ouvert={menuOuvert} onFermer={() => setMenuOuvert(false)} groupes={groupes} route={route} aller={aller} onDeconnecter={() => setQuitter(true)} />
      ) : null}
      {session && choixGroupe ? (
        <SelecteurGroupe
          groupes={groupes}
          onFermer={() => setChoixGroupe(false)}
          onChoisir={(id) => {
            groupes.choisir(id);
            setChoixGroupe(false);
            aller({ ecran: "accueil" });
          }}
        />
      ) : null}
      {enLigne ? null : (
        <p className="bandeau bandeau--horsLigne" role="status">
          {tx("app.horsLigne")}
        </p>
      )}
      {session ? <FileAttente session={session} enLigne={enLigne} /> : null}
      <main id="contenu" tabIndex={-1} className="contenu-tontine">
        {!session ? (
          <ConnexionTelephone
            onConnecte={(s) => {
              if (window.location.hash.indexOf("#/inscription") === 0) window.location.hash = "#/";
              setSession(s);
              setRoute(lireRoute(window.location.hash));
            }}
          />
        ) : route.ecran === "creer" ? (
          <div className="pile ecran" key="creer">
            <h1 className="ecran-titre-simple">{tx("sh.creer")}</h1>
            <Creation
              session={session}
              onCree={(groupId) => {
                groupes.recharger();
                groupes.choisir(groupId);
                aller({ ecran: "groupe", groupId });
              }}
              onAnnuler={() => aller({ ecran: "accueil" })}
            />
          </div>
        ) : route.ecran === "rejoindre" ? (
          <div className="pile ecran" key="rejoindre">
            <h1 className="ecran-titre-simple">{tx("sh.rejoindre")}</h1>
            <Rejoindre
              session={session}
              {...(route.code ? { codeInitial: route.code } : {})}
              onFini={() => {
                groupes.recharger();
                aller({ ecran: "accueil" });
              }}
            />
          </div>
        ) : route.ecran === "profil" ? (
          <Profil
            key="profil"
            session={session}
            onOuvrirGroupe={(groupId) => aller({ ecran: "groupe", groupId })}
            onAller={(ecran) => aller({ ecran })}
            onDeconnecter={() => setQuitter(true)}
          />
        ) : route.ecran === "cotisations" ? (
          <MesCotisations key="cotisations" session={session} onOuvrirGroupe={(groupId) => aller({ ecran: "groupe", groupId, onglet: "argent" })} />
        ) : route.ecran === "validations" ? (
          <Validations key="validations" session={session} onOuvrirGroupe={(groupId) => aller({ ecran: "groupe", groupId })} />
        ) : route.ecran === "aide" ? (
          <Aide key="aide" />
        ) : route.ecran === "documents" ? (
          <Documents key="documents" session={session} onOuvrir={(groupId, onglet) => aller({ ecran: "groupe", groupId, onglet })} />
        ) : route.ecran === "notifications" ? (
          <Notifications key="notifications" session={session} aller={aller} />
        ) : route.ecran === "groupe" ? (
          <Groupe
            key={`${route.groupId}/${route.onglet ?? ""}`}
            session={session}
            groupId={route.groupId}
            {...(route.onglet ? { ongletInitial: route.onglet } : {})}
            onRetour={() => aller({ ecran: "accueil" })}
          />
        ) : (
          <Accueil
            key="accueil"
            session={session}
            groupe={actif}
            enChargement={groupes.groupes === null && !groupes.erreur}
            enAttente={(groupes.groupes ?? []).filter((g) => g.membershipState === "pending")}
            aller={aller}
          />
        )}
      </main>
      {session ? null : (
        <footer className="pied-page">
          <p className="pied-page__promesse">{tx("app.positionnement")}</p>
          <p>
            <a className="pied-page__lien" href="/site/">
              {tx("imm.decouvrir")} →
            </a>
          </p>
        </footer>
      )}
      {quitter ? (
        <div className="voile-dialogue" onClick={(e) => e.target === e.currentTarget && setQuitter(false)}>
          <div className="dialogue dialogue-sortie" role="dialog" aria-modal="true" aria-labelledby="quitter-titre" aria-describedby="quitter-texte">
            <span className="dialogue-sortie__icone" aria-hidden="true">
              <Icone nom="sortie" taille={26} />
            </span>
            <h2 id="quitter-titre">{tx("app.deconnexionTitre")}</h2>
            <p id="quitter-texte">{tx("app.deconnexionTexte")}</p>
            {enAttente > 0 ? (
              <p className="dialogue-sortie__alerte" role="alert">
                {tx("app.deconnexionAttente", { n: enAttente })}
              </p>
            ) : null}
            <div className="actions-formulaire">
              <button id="quitter-annuler" type="button" className="bouton bouton-secondaire" onClick={() => setQuitter(false)}>
                {tx("app.annuler")}
              </button>
              <button type="button" className="bouton bouton-danger" onClick={deconnecter}>
                {tx("app.deconnexion")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {session ? (
        <nav className="nav-basse" aria-label={tx("sh.navigation")}>
          {destinations.map(([ecran, icone, libelle]) => {
            const estActif = route.ecran === ecran || (ecran === "accueil" && (route.ecran === "groupe" || route.ecran === "creer" || route.ecran === "rejoindre"));
            return (
              <button
                key={ecran}
                type="button"
                className={`nav-basse__item${estActif ? " is-actif" : ""}`}
                aria-current={estActif ? "page" : undefined}
                onClick={() => (ecran === "bureau" ? actif && ouvrirBureau(session, actif.groupId) : aller({ ecran } as Route))}
              >
                <span className="nav-basse__icone">
                  <Icone nom={icone} taille={22} />
                  {ecran === "notifications" && nonLues > 0 ? <i className="nav-basse__pastille" aria-hidden="true" /> : null}
                </span>
                <span className="nav-basse__libelle">{libelle}</span>
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
