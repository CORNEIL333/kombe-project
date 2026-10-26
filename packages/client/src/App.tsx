/* KÓMBE — PWA « tontine réelle ». Navigation par fragment (#/…) pour que les
   liens d'invitation WhatsApp (#/rejoindre/CODE) ouvrent directement le bon
   écran, même après la connexion. La session est gardée sur l'appareil. */

import { useCallback, useEffect, useState } from "react";
import { BasculeLangue, SelecteurLangue, useLangue } from "./i18n/ContexteLangue.js";
import { LogoCompose, LogoKombe } from "./composants/Marque.js";
import { acces, memoriserSession, sessionMemorisee, type Session } from "./tontine/api.js";
import { ConnexionTelephone } from "./tontine/Connexion.js";
import { Accueil, Notifications } from "./tontine/Accueil.js";
import { Creation } from "./tontine/Creation.js";
import { Rejoindre } from "./tontine/Rejoindre.js";
import { Groupe } from "./tontine/Groupe.js";
import { useTextes } from "./tontine/textes.js";
import { FileAttente } from "./tontine/FileAttente.js";
import { lireFile } from "./tontine/fileAttenteMoteur.js";
import { BandeauPhoto } from "./composants/Scene.js";
import { Icone, type NomIcone } from "./composants/Icones.js";
import { Profil } from "./tontine/Profil.js";
import { MesCotisations } from "./tontine/MesCotisations.js";
import { Validations } from "./tontine/Validations.js";
import { Aide } from "./tontine/Aide.js";
import { estBureau, ouvrirBureau } from "./tontine/bureau.js";
import { BoutonIcone } from "./tontine/ui.js";

export type Route =
  | { readonly ecran: "accueil" }
  | { readonly ecran: "creer" }
  | { readonly ecran: "notifications" }
  | { readonly ecran: "profil" }
  | { readonly ecran: "cotisations" }
  | { readonly ecran: "validations" }
  | { readonly ecran: "aide" }
  | { readonly ecran: "rejoindre"; readonly code?: string }
  | { readonly ecran: "groupe"; readonly groupId: string };

export function lireRoute(hash: string): Route {
  const parties = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [tete, arg] = parties;
  if (tete === "rejoindre") return arg ? { ecran: "rejoindre", code: arg.toUpperCase() } : { ecran: "rejoindre" };
  if (tete === "creer") return { ecran: "creer" };
  if (tete === "notifications") return { ecran: "notifications" };
  if (tete === "profil") return { ecran: "profil" };
  if (tete === "cotisations") return { ecran: "cotisations" };
  if (tete === "validations") return { ecran: "validations" };
  if (tete === "aide") return { ecran: "aide" };
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
    case "profil":
      return "#/profil";
    case "cotisations":
      return "#/cotisations";
    case "validations":
      return "#/validations";
    case "aide":
      return "#/aide";
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
  const { t } = useLangue();
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

  // Tontines où la personne siège au bureau : icône d'accès au tableau de bord.
  const [groupesBureau, setGroupesBureau] = useState<string[]>([]);
  useEffect(() => {
    if (!session) return setGroupesBureau([]);
    let actif = true;
    acces.mesTontines(session).then(
      (l) => actif && setGroupesBureau(l.filter((g) => g.membershipState === "active" && estBureau(g.roles)).map((g) => g.groupId)),
      () => undefined,
    );
    return () => {
      actif = false;
    };
  }, [session]);
  const allerBureau = () => {
    if (!session) return;
    const enCours = route.ecran === "groupe" && groupesBureau.includes(route.groupId) ? route.groupId : groupesBureau[0];
    ouvrirBureau(session, enCours);
  };

  // Déconnexion en deux temps : on confirme, et l'on prévient si des
  // opérations attendent encore le réseau sur ce téléphone.
  const [quitter, setQuitter] = useState(false);
  const enAttente = quitter ? lireFile().length : 0;
  const deconnecter = () => {
    if (session) void acces.deconnexion(session).catch(() => undefined);
    memoriserSession(null);
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

  return (
    <div className={session ? "app app-tontine" : "app app-tontine app--accueil"}>
      <a href="#contenu" className="evitement" onClick={(e) => (e.preventDefault(), document.getElementById("contenu")?.focus())}>
        {tx("app.accueil")}
      </a>
      <header className="entete">
        <div className="entete-marque">
          <button type="button" className="lien-logo" onClick={() => aller({ ecran: "accueil" })} aria-label={tx("app.accueil")}>
            {session ? <LogoKombe hauteur={34} /> : <LogoCompose symbole={60} mot={34.3} signature={10.6} ecart={14} />}
          </button>
        </div>
        {session ? null : (
          // Avant connexion : la navigation du site (maquette « Connectez-vous »).
          <nav className="entete-site" aria-label={t("cx2.accueil")}>
            <a href="#/" aria-current="page">{t("cx2.accueil")}</a>
            <a href="/site/a-propos/">{t("cx2.aPropos")}</a>
            <a href="/site/#gestes">{t("cx2.fonctionnalites")}</a>
            <a href="/site/securite/">{t("cx2.securite")}</a>
            <a href="/site/#questions">{t("cx2.faq")}</a>
          </nav>
        )}
        {session ? (
          <div className="entete-session">
            <BoutonIcone
              icone="cloche"
              libelle={nonLues > 0 ? `${tx("app.notifications")} (${nonLues})` : tx("app.notifications")}
              actif={route.ecran === "notifications"}
              className="bouton-notif"
              onClick={() => aller({ ecran: "notifications" })}
            />
            {groupesBureau.length > 0 ? <BoutonIcone icone="bureau" ton="or" libelle={tx("app.bureau")} className="bouton-bureau" onClick={allerBureau} /> : null}
            <BoutonIcone icone="profil" libelle={tx("nav.profil")} actif={route.ecran === "profil"} className="bouton-profil" onClick={() => aller({ ecran: "profil" })} />
            <BoutonIcone icone="sortir" libelle={tx("app.deconnexion")} className="bouton-sortie" onClick={() => setQuitter(true)} />
          </div>
        ) : null}
        <div className="entete-actions">{session ? <BasculeLangue /> : <SelecteurLangue />}</div>
      </header>
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
            <BandeauPhoto photo="decision" surtitre={tx("imm.crSur")} titre={tx("imm.crTitre")} accent={tx("imm.crAccent")}>
              <p className="bandeau-photo__meta">{tx("imm.crTexte")}</p>
            </BandeauPhoto>
            <Creation session={session} onCree={(groupId) => aller({ ecran: "groupe", groupId })} onAnnuler={() => aller({ ecran: "accueil" })} />
          </div>
        ) : route.ecran === "rejoindre" ? (
          <div className="pile ecran" key="rejoindre">
            <BandeauPhoto photo="generations" variante="compact" surtitre={tx("imm.rejSur")} titre={tx("imm.rejTitre")} accent={tx("imm.rejAccent")} />
            <Rejoindre session={session} {...(route.code ? { codeInitial: route.code } : {})} onFini={() => aller({ ecran: "accueil" })} />
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
          <MesCotisations key="cotisations" session={session} onOuvrirGroupe={(groupId) => aller({ ecran: "groupe", groupId })} />
        ) : route.ecran === "validations" ? (
          <Validations key="validations" session={session} onOuvrirGroupe={(groupId) => aller({ ecran: "groupe", groupId })} />
        ) : route.ecran === "aide" ? (
          <Aide key="aide" />
        ) : route.ecran === "notifications" ? (
          <Notifications key="notifications" session={session} onOuvrir={(groupId) => aller({ ecran: "groupe", groupId })} />
        ) : route.ecran === "groupe" ? (
          <Groupe key={route.groupId} session={session} groupId={route.groupId} onRetour={() => aller({ ecran: "accueil" })} />
        ) : (
          <Accueil
            key="accueil"
            session={session}
            onOuvrir={(groupId) => aller({ ecran: "groupe", groupId })}
            onCreer={() => aller({ ecran: "creer" })}
            onRejoindre={() => aller({ ecran: "rejoindre" })}
          />
        )}
      </main>
      <footer className="pied-page">
        <p className="pied-page__promesse">{tx("app.positionnement")}</p>
        <p>
          <a className="pied-page__lien" href="/site/">
            {tx("imm.decouvrir")} →
          </a>
        </p>
        {session ? (
          <p>
            <button type="button" className="pied-page__sortie" onClick={() => setQuitter(true)}>
              <Icone nom="sortie" taille={18} />
              {tx("app.deconnexion")}
            </button>
          </p>
        ) : null}
      </footer>
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
        <nav className="nav-basse" aria-label={tx("app.accueil")}>
          {(
            [
              ["accueil", "accueil", tx("nav.accueil")],
              ["cotisations", "declarer", tx("nav.cotisations")],
              ...(groupesBureau.length > 0 ? ([["bureau", "bureau", tx("app.bureau")]] as const) : []),
              ["notifications", "cloche", tx("nav.activite")],
              ["profil", "profil", tx("nav.profil")],
            ] as readonly (readonly [string, NomIcone, string])[]
          ).map(([ecran, icone, libelle]) => {
            const actif = route.ecran === ecran || (ecran === "accueil" && (route.ecran === "groupe" || route.ecran === "creer" || route.ecran === "rejoindre"));
            return (
              <button
                key={ecran}
                type="button"
                className={`nav-basse__item${actif ? " is-actif" : ""}${ecran === "bureau" ? " nav-basse__item--bureau" : ""}`}
                aria-current={actif ? "page" : undefined}
                onClick={() => (ecran === "bureau" ? allerBureau() : aller({ ecran } as Route))}
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
