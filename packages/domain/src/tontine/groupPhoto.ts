/* KÓMBE — photo de profil d'une tontine : validation stricte d'un JPEG
   envoyé par un client, sans bibliothèque native (fonction serverless).
   Les clients recadrent en carré et ré-encodent en JPEG (ce qui écarte déjà
   EXIF/GPS) ; le serveur NE FAIT PAS CONFIANCE au client :
   - signature JPEG (SOI … EOI), structure de segments cohérente ;
   - dimensions lues dans l'en-tête SOF, carré exact attendu ;
   - taille bornée ;
   - métadonnées retirées (APP1–APP13, APP15, commentaires) : seules
     restent les données d'image (et JFIF/Adobe, sans contenu personnel).
   SVG, PNG, GIF, HEIC… sont refusés : un seul format, celui produit par les
   clients. */

import { DomainError } from "../errors.js";

export const PHOTO_VARIANTS = { 512: 409_600, 256: 153_600 } as const;
export type PhotoSize = keyof typeof PHOTO_VARIANTS;

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2]); // baseline, étendu, progressif
const KEEP_APP = new Set([0xe0, 0xee]); // APP0 (JFIF), APP14 (Adobe : transformation couleur)

function refuser(message: string): never {
  throw new DomainError("PHOTO_INVALID", message);
}

/** Valide un JPEG carré `size`×`size` et le renvoie sans métadonnées. */
export function cleanGroupPhoto(bytes: Uint8Array, size: PhotoSize): Uint8Array {
  if (bytes.length < 128) refuser("Image vide ou tronquée");
  if (bytes.length > PHOTO_VARIANTS[size]) refuser(`Image trop lourde (${size} px : ${PHOTO_VARIANTS[size] / 1024} Ko au plus)`);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) refuser("Seules les photos JPEG préparées par l'application sont acceptées");
  const garde: number[][] = [[0xff, 0xd8]];
  let i = 2;
  let dims: { w: number; h: number } | null = null;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) refuser("Structure JPEG invalide");
    // Octets de remplissage 0xFF autorisés entre segments.
    while (bytes[i] === 0xff && i < bytes.length) i++;
    const marker = bytes[i++] as number;
    if (marker === 0xd9) refuser("Image sans données");
    if (marker === 0xda) {
      // Début du flux compressé : on garde tout jusqu'à EOI final.
      if (!dims) refuser("En-tête d'image absent");
      if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) refuser("Image tronquée");
      garde.push([0xff, 0xda], Array.from(bytes.subarray(i)));
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) refuser("Structure JPEG invalide");
    if (i + 2 > bytes.length) refuser("Image tronquée");
    const len = ((bytes[i] as number) << 8) | (bytes[i + 1] as number);
    if (len < 2 || i + len > bytes.length) refuser("Segment JPEG invalide");
    const segment = bytes.subarray(i, i + len);
    if (SOF_MARKERS.has(marker)) {
      if (len < 8) refuser("En-tête d'image invalide");
      const h = ((segment[3] as number) << 8) | (segment[4] as number);
      const w = ((segment[5] as number) << 8) | (segment[6] as number);
      dims = { w, h };
    } else if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      refuser("Codage JPEG non pris en charge");
    }
    const metadonnee = (marker >= 0xe0 && marker <= 0xef && !KEEP_APP.has(marker)) || marker === 0xfe;
    if (!metadonnee) garde.push([0xff, marker], Array.from(segment));
    i += len;
  }
  if (!dims) refuser("En-tête d'image absent");
  if (dims.w !== size || dims.h !== size) refuser(`Photo attendue en carré ${size}×${size} (reçu ${dims.w}×${dims.h})`);
  const out = new Uint8Array(garde.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of garde) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
