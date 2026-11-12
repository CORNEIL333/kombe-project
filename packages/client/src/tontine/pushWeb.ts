/* KÓMBE — Push Web sur ce navigateur (A14, R-07). Le navigateur s'abonne
   auprès de son service de notification avec la clé publique VAPID du
   serveur ; l'abonnement est enregistré comme appareil `web`. Le message
   reçu reste générique (ni montant, ni nom : ADR-0016). Rien n'est proposé
   si le navigateur ou le serveur ne le permettent pas. */

import { acces, type Session } from "./api.js";

export type EtatPushWeb = "indisponible" | "refuse" | "inactif" | "actif";

const CLE_APPAREIL = "kombe.pushWeb.appareil";
const SCRIPT = "/sw-notifications.js";

function pris(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
}

function lireAppareil(): string | null {
  try {
    return window.localStorage.getItem(CLE_APPAREIL);
  } catch {
    return null;
  }
}

function garderAppareil(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CLE_APPAREIL, id);
    else window.localStorage.removeItem(CLE_APPAREIL);
  } catch {
    /* stockage indisponible : l'état se relit depuis l'abonnement */
  }
}

/** Clé VAPID (base64url) → octets attendus par `pushManager.subscribe`. */
export function cleEnOctets(cle: string): Uint8Array<ArrayBuffer> {
  const b64 = (cle + "=".repeat((4 - (cle.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(b64);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

export async function etatPushWeb(): Promise<{ readonly etat: EtatPushWeb; readonly cle: string | null }> {
  if (!pris()) return { etat: "indisponible", cle: null };
  const { publicKey } = await acces.cleWebPush().catch(() => ({ publicKey: null }));
  if (!publicKey) return { etat: "indisponible", cle: null };
  if (Notification.permission === "denied") return { etat: "refuse", cle: publicKey };
  const reg = await navigator.serviceWorker.getRegistration(SCRIPT).catch(() => undefined);
  const abonnement = await reg?.pushManager.getSubscription().catch(() => null);
  return { etat: abonnement && lireAppareil() ? "actif" : "inactif", cle: publicKey };
}

/** Demande l'autorisation, s'abonne, enregistre l'appareil. */
export async function activerPushWeb(session: Session, cle: string): Promise<EtatPushWeb> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "refuse" : "inactif";
  const reg = await navigator.serviceWorker.register(SCRIPT);
  const abonnement =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleEnOctets(cle) }));
  const { deviceId } = await acces.enregistrerAppareil(session, "web", JSON.stringify(abonnement.toJSON()));
  garderAppareil(deviceId);
  return "actif";
}

/** Se désabonne sur ce navigateur et retire l'appareil côté serveur. */
export async function desactiverPushWeb(session: Session): Promise<EtatPushWeb> {
  const reg = await navigator.serviceWorker.getRegistration(SCRIPT);
  await (await reg?.pushManager.getSubscription())?.unsubscribe();
  const id = lireAppareil();
  if (id) await acces.retirerAppareil(session, id).catch(() => undefined); // déjà retiré : rien à faire
  garderAppareil(null);
  return "inactif";
}
