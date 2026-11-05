/* KÓMBE — coquille de l'espace connecté (planche de référence 2026-11) :
   colonne forêt (logo, carte de la personne), « Mes groupes » avec photo ou
   initiales et fonction, navigation, déconnexion, motif tissé en pied.
   Ouverte en colonne sur grand écran ; sur téléphone elle glisse par-dessus,
   se ferme par Échap, le voile ou le bouton, et rend le focus. */

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import type { Route } from "../App.js";
import { BasculeLangue } from "../i18n/ContexteLangue.js";
import { Icone, type NomIcone } from "../composants/Icones.js";
import { LogoKombe } from "../composants/Marque.js";
import type { GroupeActif } from "./groupeActif.js";
import type { Session, TontineSummary } from "./api.js";
import { AvatarGroupe, initiales } from "./PhotoGroupe.js";
import { useTextes } from "./textes.js";

function useEchap(actif: boolean, fermer: () => void) {
  useEffect(() => {
    if (!actif) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [actif, fermer]);
}

const roleDe = (g: TontineSummary) => g.roles.find((r) => r !== "member") ?? "member";

export function MenuLateral({
  session,
  nom,
  ouvert,
  onFermer,
  groupes,
  route,
  aller,
  onDeconnecter,
}: {
  readonly session: Session;
  readonly nom: string | null;
  readonly ouvert: boolean;
  readonly onFermer: () => void;
  readonly groupes: GroupeActif;
  readonly route: Route;
  readonly aller: (r: Route) => void;
  readonly onDeconnecter: () => void;
}) {
  const { tx, dyn } = useTextes();
  const premier = useRef<HTMLButtonElement>(null);
  useEchap(ouvert, onFermer);
  // Focus : dans le menu à l'ouverture, rendu au bouton à la fermeture.
  const etaitOuvert = useRef(false);
  useEffect(() => {
    if (ouvert) requestAnimationFrame(() => premier.current?.focus());
    else if (etaitOuvert.current) (document.querySelector(".barre-haut__menu") as HTMLElement | null)?.focus?.();
    etaitOuvert.current = ouvert;
  }, [ouvert]);

  const actifs = (groupes.groupes ?? []).filter((g) => g.membershipState === "active");
  const actif = groupes.actif;
  const lien = (cible: Route, icone: NomIcone, libelle: string, courant: boolean) => (
    <li>
      <button type="button" className="menu-lateral__lien" aria-current={courant ? "page" : undefined} onClick={() => aller(cible)}>
        <Icone nom={icone} taille={22} />
        <span>{libelle}</span>
      </button>
    </li>
  );

  return (
    <>
      <div className={ouvert ? "menu-voile is-ouvert" : "menu-voile"} onClick={onFermer} aria-hidden="true" />
      <nav id="menu-lateral" className={ouvert ? "menu-lateral is-ouvert" : "menu-lateral"} aria-label={tx("sh.menu")}>
        <div className="menu-lateral__tete">
          <div className="menu-lateral__marque">
            <LogoKombe hauteur={34} variante="inverse" />
            <span className="menu-lateral__signature">{tx("sh.signature")}</span>
          </div>
          <button ref={premier} type="button" className="menu-lateral__fermer" aria-label={tx("sh.fermer")} onClick={onFermer}>
            <Icone nom="fermer" taille={22} />
          </button>
        </div>
        <button type="button" className="menu-lateral__personne" onClick={() => aller({ ecran: "profil" })}>
          <span className="menu-lateral__personne-avatar" aria-hidden="true">
            {initiales(nom ?? "?")}
          </span>
          <span className="menu-lateral__personne-texte">
            <span className="menu-lateral__personne-nom">{nom ?? tx("pf.sansNom")}</span>
            {actif ? <span className="menu-lateral__personne-role">{dyn(`role.${roleDe(actif)}`)}</span> : null}
          </span>
          <Icone nom="chevron" taille={20} />
        </button>

        <div className="menu-lateral__corps">
          <div className="menu-lateral__titre">
            <h2>{tx("sh.mesGroupesN", { n: actifs.length })}</h2>
            <button type="button" className="menu-lateral__ajout" aria-label={tx("sh.creer")} title={tx("sh.creer")} onClick={() => aller({ ecran: "creer" })}>
              <Icone nom="plus" taille={18} />
            </button>
          </div>
          <ul className="menu-lateral__liste">
            {actifs.map((g) => {
              const choisi = g.groupId === actif?.groupId;
              const role = roleDe(g);
              return (
                <li key={g.groupId}>
                  <button
                    type="button"
                    className={choisi ? "menu-lateral__groupe is-choisi" : "menu-lateral__groupe"}
                    aria-current={choisi ? "true" : undefined}
                    onClick={() => {
                      groupes.choisir(g.groupId);
                      aller({ ecran: "accueil" });
                    }}
                  >
                    <AvatarGroupe session={session} groupId={g.groupId} nom={g.name} version={g.photoVersion} taille={42} rond />
                    <span className="menu-lateral__groupe-texte">
                      <span className="menu-lateral__groupe-nom">{g.name}</span>
                      <span className="menu-lateral__groupe-role">{dyn(`role.${role}`)}</span>
                    </span>
                    {choisi ? <Icone nom="coche" taille={20} /> : null}
                  </button>
                </li>
              );
            })}
            {lien({ ecran: "rejoindre" }, "inviter", tx("sh.rejoindre"), route.ecran === "rejoindre")}
          </ul>
          <hr />
          <ul className="menu-lateral__liste menu-lateral__nav">
            {lien({ ecran: "accueil" }, "accueil", tx("nav.accueil"), route.ecran === "accueil")}
            {lien({ ecran: "cotisations" }, "declarer", tx("nav.cotisations"), route.ecran === "cotisations")}
            {lien({ ecran: "groupes" }, "groupes", tx("nav.groupes"), route.ecran === "groupes" || route.ecran === "groupe")}
            {lien({ ecran: "notifications" }, "cloche", tx("nav.activite"), route.ecran === "notifications")}
            {actif ? lien({ ecran: "groupe", groupId: actif.groupId, onglet: "decisions" }, "vote", tx("sh.votes"), false) : null}
            {lien({ ecran: "documents" }, "document", tx("doc.titre"), route.ecran === "documents")}
            {lien({ ecran: "aide" }, "aide", tx("sh.aideSupport"), route.ecran === "aide")}
            {lien({ ecran: "profil" }, "reglages", tx("sh.parametres"), route.ecran === "profil")}
          </ul>
          <hr />
          <BasculeLangue />
          <button type="button" className="menu-lateral__lien menu-lateral__sortie" onClick={onDeconnecter}>
            <Icone nom="sortie" taille={22} />
            <span>{tx("app.deconnexion")}</span>
          </button>
        </div>
        <div className="menu-lateral__pied" aria-hidden="true" />
      </nav>
    </>
  );
}

/** Choisir le groupe actif sans quitter l'écran (demi-fenêtre sur téléphone). */
export function SelecteurGroupe({
  session,
  groupes,
  onFermer,
  onChoisir,
}: {
  readonly session: Session;
  readonly groupes: GroupeActif;
  readonly onFermer: () => void;
  readonly onChoisir: (groupId: string) => void;
}) {
  const { tx, dyn } = useTextes();
  const fermer = useRef<HTMLButtonElement>(null);
  useEchap(true, onFermer);
  useEffect(() => {
    fermer.current?.focus();
    const declencheur = document.querySelector(".selecteur-groupe") as HTMLElement | null;
    return () => declencheur?.focus?.();
  }, []);
  const actifs = (groupes.groupes ?? []).filter((g) => g.membershipState === "active");
  return createPortal(
    <div className="voile-dialogue voile-dialogue--bas" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="dialogue panneau-bas" role="dialog" aria-modal="true" aria-labelledby="choix-groupe-titre">
        <div className="panneau-bas__tete">
          <h2 id="choix-groupe-titre">{tx("sh.vosGroupes")}</h2>
          <button ref={fermer} type="button" className="bouton-icone-nu" aria-label={tx("app.annuler")} onClick={onFermer}>
            <Icone nom="fermer" taille={22} />
          </button>
        </div>
        <ul className="lignes">
          {actifs.map((g) => {
            const choisi = g.groupId === groupes.actif?.groupId;
            return (
              <li key={g.groupId}>
                <button type="button" className="ligne" aria-current={choisi ? "true" : undefined} onClick={() => onChoisir(g.groupId)}>
                  <AvatarGroupe session={session} groupId={g.groupId} nom={g.name} version={g.photoVersion} taille={44} rond />
                  <span className="ligne__texte">
                    <span className="ligne__titre">{g.name}</span>
                    <span className="ligne__sous">{dyn(`role.${roleDe(g)}`)}</span>
                  </span>
                  {choisi ? <Icone nom="coche" taille={20} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
