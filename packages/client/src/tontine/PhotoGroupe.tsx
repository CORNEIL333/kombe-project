/* KÓMBE — photo de profil d'une tontine (PWA).
   - Affichage : octets lus avec la session (aucune URL publique), mis en
     cache par version ; sans photo, initiales sur le motif de l'anneau KÓMBE
     (jamais un portrait d'illustration présenté comme le groupe).
   - Modification (présidence, secrétariat ; le serveur tranche) : fichier →
     orientation appliquée → recadrage carré (zoom) → JPEG 512 et 256 px
     ré-encodés (EXIF/GPS écartés) → envoi ; le serveur revalide tout. */

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { GroupRole } from "@kombe/domain";
import { acces, lireMaPhoto, lirePhotoGroupe, lirePhotoMembre, tontines, type Session } from "./api.js";
import { peut } from "./droits.js";
import { useTextes } from "./textes.js";
import { Icone } from "../composants/Icones.js";

const cache = new Map<string, string | null>();

function useImage(cle: string, lire: () => Promise<Blob | null>): string | null {
  const [url, setUrl] = useState<string | null>(() => (cle ? (cache.get(cle) ?? null) : null));
  useEffect(() => {
    if (!cle) {
      setUrl(null);
      return;
    }
    if (cache.has(cle)) {
      setUrl(cache.get(cle) ?? null);
      return;
    }
    let vivant = true;
    lire().then(
      (b) => {
        const u = b ? URL.createObjectURL(b) : null;
        cache.set(cle, u);
        if (vivant) setUrl(u);
      },
      () => undefined, // réseau instable : les initiales restent
    );
    return () => {
      vivant = false;
    };
    // `lire` change à chaque rendu ; `cle` porte déjà groupe, membre, version et taille.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return url;
}

function usePhoto(session: Session, groupId: string, version: number | null | undefined, taille: 256 | 512): string | null {
  return useImage(version ? `${groupId}:${version}:${taille}` : "", () => lirePhotoGroupe(session, groupId, version as number, taille));
}

const MOTS_VIDES = new Set(["le", "la", "les", "l", "de", "des", "du", "d", "et", "the", "of", "and", "a", "à", "au", "aux"]);

/** « Les Étoiles de Yaoundé » → « EY » ; repli sur la première lettre. */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/[\s'’-]+/).filter((m) => m && !MOTS_VIDES.has(m.toLowerCase()));
  const lettres = (mots[0]?.[0] ?? nom.trim()[0] ?? "K") + (mots[1]?.[0] ?? "");
  return lettres.toUpperCase();
}

/** Motif de repli stable par groupe (0 : anneau ; 1–2 : tissages de la marque). */
function motif(cle: string): string {
  let h = 0;
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
  return String(h % 3);
}

/** Teinte stable d'une tontine (0 forêt, 1 corail, 2 émeraude, 3 prune) : la même sur mobile. */
export function teinteGroupe(cle: string): string {
  let h = 7;
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) & 0x7fffffff;
  return String(h % 4);
}

/** Blason d'un groupe : photo ou initiales + motif. */
export function AvatarGroupe({
  session,
  groupId,
  nom,
  version,
  taille = 40,
  rond = false,
}: {
  readonly session: Session;
  readonly groupId: string;
  readonly nom: string;
  readonly version?: number | null | undefined;
  readonly taille?: number;
  readonly rond?: boolean;
}) {
  const url = usePhoto(session, groupId, version, taille > 96 ? 512 : 256);
  const style = { width: taille, height: taille, fontSize: Math.round(taille * 0.38) };
  return (
    <span className={rond ? "avatar-groupe avatar-groupe--rond" : "avatar-groupe"} style={style} data-motif={url ? undefined : motif(groupId)} data-teinte={url ? undefined : teinteGroupe(groupId)} aria-hidden="true">
      {url ? <img src={url} alt="" width={taille} height={taille} decoding="async" /> : <span className="avatar-groupe__initiales">{initiales(nom)}</span>}
    </span>
  );
}

/** Photo d'une personne, ronde. Les initiales ne sont qu'un repli tant qu'aucune photo n'a été envoyée. */
export function AvatarPersonne({
  session,
  groupId,
  membreId,
  nom,
  version,
  taille = 42,
}: {
  readonly session: Session;
  /** Absents : c'est ma propre photo. */
  readonly groupId?: string | undefined;
  readonly membreId?: string | undefined;
  readonly nom: string;
  readonly version?: number | null | undefined;
  readonly taille?: number;
}) {
  const px = taille > 96 ? 512 : 256;
  const cle = version ? `p:${groupId ?? "moi"}:${membreId ?? "moi"}:${version}:${px}` : "";
  const url = useImage(cle, () => (groupId && membreId ? lirePhotoMembre(session, groupId, membreId, version as number, px) : lireMaPhoto(session, version as number, px)));
  return (
    <span className="avatar-personne" style={{ width: taille, height: taille, fontSize: Math.round(taille * 0.38) }} data-teinte={url ? undefined : teinteGroupe(nom)} aria-hidden="true">
      {url ? <img src={url} alt="" width={taille} height={taille} decoding="async" /> : initiales(nom)}
    </span>
  );
}

/* ── Préparation de l'image ─────────────────────────────────────────── */

const LIMITES = { 512: 400 * 1024, 256: 150 * 1024 } as const;

async function enJpegBase64(source: ImageBitmap, recadrage: { x: number; y: number; cote: number }, taille: 256 | 512): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = taille;
  canvas.height = taille;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, recadrage.x, recadrage.y, recadrage.cote, recadrage.cote, 0, 0, taille, taille);
  // Qualité décroissante jusqu'à respecter la limite du serveur.
  for (const q of [0.86, 0.78, 0.68, 0.58]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", q));
    if (blob && blob.size <= LIMITES[taille]) {
      const octets = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
      return btoa(bin);
    }
  }
  throw new Error("trop-lourd");
}

/** Recadrage carré centré, réduit par le zoom (1 = plus grand carré possible). */
function carre(l: number, h: number, zoom: number, decalX: number, decalY: number) {
  const cote = Math.min(l, h) / zoom;
  const x = Math.max(0, Math.min(l - cote, (l - cote) / 2 + decalX * (l - cote) / 2));
  const y = Math.max(0, Math.min(h - cote, (h - cote) / 2 + decalY * (h - cote) / 2));
  return { x, y, cote };
}

/* ── Dialogue de modification ───────────────────────────────────────── */

export function DialoguePhoto({
  session,
  groupId,
  nom,
  version,
  onFermer,
  onChange,
}: {
  readonly session: Session;
  /** Absent : ma propre photo de profil. */
  readonly groupId?: string;
  readonly nom: string;
  readonly version: number | null | undefined;
  readonly onFermer: () => void;
  readonly onChange: (version: number | null) => void;
}) {
  const { tx } = useTextes();
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const apercu = useRef<HTMLCanvasElement>(null);
  const fermer = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fermer.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && !enCours && onFermer();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [enCours, onFermer]);

  useEffect(() => {
    const c = apercu.current;
    if (!c || !image) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const r = carre(image.width, image.height, zoom, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(image, r.x, r.y, r.cote, r.cote, 0, 0, c.width, c.height);
  }, [image, zoom]);

  const choisir = async (f: File | undefined) => {
    setErreur(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) || f.size > 15 * 1024 * 1024) {
      setErreur(tx("ph.formatRefuse"));
      return;
    }
    try {
      // `from-image` applique l'orientation EXIF avant recadrage.
      setImage(await createImageBitmap(f, { imageOrientation: "from-image" }));
      setZoom(1);
    } catch {
      setErreur(tx("ph.illisible"));
    }
  };

  const enregistrer = async () => {
    if (!image || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const r = carre(image.width, image.height, zoom, 0, 0);
      const [i512, i256] = await Promise.all([enJpegBase64(image, r, 512), enJpegBase64(image, r, 256)]);
      const res = groupId ? await tontines.changerPhoto(session, groupId, i512, i256) : await acces.changerMaPhoto(session, i512, i256);
      onChange(res.photoVersion);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error && e.message === "trop-lourd" ? tx("ph.tropLourd") : e instanceof Error && e.message ? e.message : tx("ph.echec"));
      setEnCours(false);
    }
  };

  const retirer = async () => {
    if (enCours) return;
    setEnCours(true);
    try {
      await (groupId ? tontines.retirerPhoto(session, groupId) : acces.retirerMaPhoto(session));
      onChange(null);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : tx("ph.echec"));
      setEnCours(false);
    }
  };

  return createPortal(
    <div className="voile-dialogue voile-dialogue--bas" onClick={(e) => e.target === e.currentTarget && !enCours && onFermer()}>
      <div className="dialogue panneau-bas" role="dialog" aria-modal="true" aria-labelledby="photo-titre">
        <div className="panneau-bas__tete">
          <h2 id="photo-titre">{groupId ? tx("ph.titre") : tx("ph.maPhoto")}</h2>
          <button ref={fermer} type="button" className="bouton-icone-nu" aria-label={tx("app.annuler")} disabled={enCours} onClick={onFermer}>
            <Icone nom="fermer" taille={22} />
          </button>
        </div>
        <div className="photo-edition">
          {image ? (
            <canvas ref={apercu} className="photo-edition__apercu" width={240} height={240} aria-label={tx("ph.apercu")} role="img" />
          ) : groupId ? (
            <AvatarGroupe session={session} groupId={groupId} nom={nom} version={version} taille={160} />
          ) : (
            <AvatarPersonne session={session} nom={nom} version={version} taille={160} />
          )}
          {image ? (
            <label className="photo-edition__zoom">
              <span>{tx("ph.zoom")}</span>
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
          ) : null}
          <label className="bouton bouton-secondaire photo-edition__choisir">
            <Icone nom="modifier" taille={18} />
            {image ? tx("ph.autre") : tx("ph.choisir")}
            <input className="visuellement-cache" type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={(e) => void choisir(e.target.files?.[0])} />
          </label>
          <p className="aide-champ">{groupId ? tx("ph.aide") : tx("ph.aideMoi")}</p>
          {erreur ? (
            <p className="msg msg--erreur" role="alert">
              {erreur}
            </p>
          ) : null}
          <div className="actions-formulaire">
            {version ? (
              <button type="button" className="bouton bouton-texte bouton-danger-texte" disabled={enCours} onClick={() => void retirer()}>
                {tx("ph.retirer")}
              </button>
            ) : null}
            <button type="button" className="bouton" disabled={!image || enCours} onClick={() => void enregistrer()}>
              {enCours ? tx("app.envoi") : tx("ph.enregistrer")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Affichage du bouton selon le miroir des droits (le serveur reste juge). */
export const peutChangerPhoto = (roles: readonly GroupRole[]) => peut(roles, "group.photo");
