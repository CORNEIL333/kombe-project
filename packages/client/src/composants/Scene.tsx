/* KÓMBE — bandeaux photographiques de la PWA (direction v2 « L'Orbite »).
   Les photos sont des ILLUSTRATIONS d'ambiance (banque de marque,
   /brand/photos) : elles ne représentent jamais un membre réel du groupe et
   restent décoratives (alt vide / aria-hidden). Le texte du bandeau porte
   seul l'information. Le choix de la photo d'un groupe est déterministe
   (même groupe → même image à chaque visite), sans aucune donnée inventée. */

import type { ReactNode } from "react";

const P = "/brand/photos/";
export const PHOTOS_AMBIANCE = [
  "cercle-vue-dessus",
  "tour-beneficiaire",
  "generations",
  "quartier",
  "tresoriere",
  "decision",
  "mains-telephone",
  "hero-cercle",
] as const;
export type NomPhoto = (typeof PHOTOS_AMBIANCE)[number] | "onboarding-portrait";

export const urlPhoto = (nom: NomPhoto, ambiance = false): string => `${P}${nom}${ambiance ? "-ambiance" : ""}.webp`;

/** Photo d'ambiance stable pour une clé (identifiant de groupe). */
export function photoPour(cle: string): NomPhoto {
  let h = 0;
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
  return PHOTOS_AMBIANCE[h % PHOTOS_AMBIANCE.length] as NomPhoto;
}

/** Bandeau d'écran : photo plein cadre, voile forêt, titre Manrope + une
    phrase Newsreader italique (une seule par titre, règle de la charte). */
export function BandeauPhoto({
  photo,
  surtitre,
  titre,
  accent,
  children,
  orbite,
  variante = "standard",
  titreNiveau = 2,
}: {
  readonly photo: NomPhoto;
  readonly surtitre?: ReactNode;
  readonly titre: ReactNode;
  readonly accent?: ReactNode;
  readonly children?: ReactNode;
  readonly orbite?: ReactNode;
  readonly variante?: "standard" | "compact";
  readonly titreNiveau?: 1 | 2;
}) {
  const Titre = titreNiveau === 1 ? "h1" : "h2";
  return (
    <section className={`bandeau-photo bandeau-photo--${variante}`}>
      <div className="bandeau-photo__image" aria-hidden="true">
        <img src={urlPhoto(photo)} alt="" decoding="async" />
      </div>
      <div className="bandeau-photo__voile" aria-hidden="true" />
      <svg className="bandeau-photo__orbites" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
        <circle cx="200" cy="200" r="150" />
        <circle cx="200" cy="200" r="196" />
      </svg>
      <div className="bandeau-photo__contenu">
        <div className="bandeau-photo__texte">
          {surtitre ? <p className="surtitre">{surtitre}</p> : null}
          <Titre className="bandeau-photo__titre">
            {titre}
            {accent ? (
              <>
                {" "}
                <em>{accent}</em>
              </>
            ) : null}
          </Titre>
          {children}
        </div>
        {orbite ? <div className="bandeau-photo__orbite">{orbite}</div> : null}
      </div>
    </section>
  );
}
