/* KÓMBE — coquille de l'espace connecté : menu latéral et choix du groupe
   actif. Le menu porte les destinations MOINS fréquentes (groupes, documents,
   aide, profil, langue, déconnexion) ; les tâches courantes restent sur
   l'accueil et la barre du bas. Sur grand écran, le menu reste ouvert en
   colonne ; sur téléphone, il glisse par-dessus et se ferme par Échap, le
   voile ou le bouton — le focus revient au bouton du menu. */

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import type { Route } from "../App.js";
import { BasculeLangue } from "../i18n/ContexteLangue.js";
import { Icone, type NomIcone } from "../composants/Icones.js";
import { LogoKombe } from "../composants/Marque.js";
import type { GroupeActif } from "./groupeActif.js";
import type { Session } from "./api.js";
import { AvatarGroupe } from "./PhotoGroupe.js";
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

export function MenuLateral({
  session,
  ouvert,
  onFermer,
  groupes,
  route,
  aller,
  onDeconnecter,
}: {
  readonly session: Session;
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
  // Focus : dans le menu à l'ouverture, rendu au bouton à la fermeture —
  // jamais déplacé au premier affichage de la page.
  const etaitOuvert = useRef(false);
  useEffect(() => {
    // Après l'application du style (le menu sort de `visibility: hidden`).
    if (ouvert) requestAnimationFrame(() => premier.current?.focus());
    else if (etaitOuvert.current) (document.querySelector(".barre-haut__menu") as HTMLElement | null)?.focus?.();
    etaitOuvert.current = ouvert;
  }, [ouvert]);

  const actifs = (groupes.groupes ?? []).filter((g) => g.membershipState === "active");
  const lien = (ecran: Route["ecran"], icone: NomIcone, libelle: string) => (
    <li>
      <button type="button" className="menu-lateral__lien" aria-current={route.ecran === ecran ? "page" : undefined} onClick={() => aller({ ecran } as Route)}>
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
          <LogoKombe hauteur={28} />
          <button ref={premier} type="button" className="menu-lateral__fermer" aria-label={tx("sh.fermer")} onClick={onFermer}>
            <Icone nom="fermer" taille={22} />
          </button>
        </div>
        {/* Grand écran : les quatre destinations principales (la barre du bas est masquée). */}
        <ul className="menu-lateral__liste menu-lateral__principal">
          {lien("accueil", "accueil", tx("nav.accueil"))}
          {lien("cotisations", "declarer", tx("nav.cotisations"))}
          {lien("groupes", "groupes", tx("nav.groupes"))}
          {lien("notifications", "cloche", tx("nav.activite"))}
        </ul>
        <h2 className="menu-lateral__titre">{tx("sh.vosGroupes")}</h2>
        <ul className="menu-lateral__liste">
          {actifs.map((g) => {
            const choisi = g.groupId === groupes.actif?.groupId;
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
                  <AvatarGroupe session={session} groupId={g.groupId} nom={g.name} version={g.photoVersion} taille={36} />
                  <span className="menu-lateral__groupe-texte">
                    <span>{g.name}</span>
                    <span className="aide-champ">
                      {g.roles.filter((r) => r !== "member").map((r) => dyn(`role.${r}`)).join(" · ") || dyn("role.member")}
                    </span>
                  </span>
                  {choisi ? <Icone nom="coche" taille={20} /> : null}
                </button>
              </li>
            );
          })}
          {lien("rejoindre", "inviter", tx("sh.rejoindre"))}
          {lien("creer", "plus", tx("sh.creer"))}
        </ul>
        <hr />
        <ul className="menu-lateral__liste">
          {lien("documents", "document", tx("doc.titre"))}
          {lien("aide", "aide", tx("pf.aide"))}
          {lien("profil", "profil", tx("sh.profil"))}
        </ul>
        <div className="menu-lateral__pied">
          <BasculeLangue />
          <button type="button" className="menu-lateral__lien menu-lateral__sortie" onClick={onDeconnecter}>
            <Icone nom="sortie" taille={22} />
            <span>{tx("app.deconnexion")}</span>
          </button>
        </div>
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
                  <AvatarGroupe session={session} groupId={g.groupId} nom={g.name} version={g.photoVersion} taille={40} />
                  <span className="ligne__texte">
                    <span className="ligne__titre">{g.name}</span>
                    <span className="ligne__sous">{g.roles.filter((r) => r !== "member").map((r) => dyn(`role.${r}`)).join(" · ") || dyn("role.member")}</span>
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
