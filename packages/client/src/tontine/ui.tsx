/* KÓMBE — briques d'interface de l'espace tontine : chargement avec reprise,
   action protégée contre le double appui, messages d'état accessibles. */

import { SymboleKombe } from "../composants/Marque.js";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { estSessionExpiree, messageErreur } from "./api.js";
import { EnFileAttente, estErreurReseau } from "./fileAttenteMoteur.js";
import { useTextes } from "./textes.js";

export type Etat<T> = { readonly statut: "chargement" } | { readonly statut: "ok"; readonly donnees: T } | { readonly statut: "erreur"; readonly message: string; readonly expiree: boolean };

/** Charge une ressource ; `recharger` relance sans démonter l'écran. */
export function useDonnees<T>(charger: () => Promise<T>, deps: readonly unknown[]): { etat: Etat<T>; recharger: () => void } {
  const [etat, setEtat] = useState<Etat<T>>({ statut: "chargement" });
  const [tour, setTour] = useState(0);
  const chargerRef = useRef(charger);
  chargerRef.current = charger;
  useEffect(() => {
    let actif = true;
    setEtat((e) => (e.statut === "ok" ? e : { statut: "chargement" }));
    chargerRef.current().then(
      (donnees) => actif && setEtat({ statut: "ok", donnees }),
      // Sans réseau, on garde à l'écran les dernières données reçues plutôt
      // que d'effacer la séance en cours (le bandeau dit qu'on est hors ligne).
      (err: unknown) =>
        actif &&
        setEtat((e) =>
          e.statut === "ok" && (estErreurReseau(err) || (typeof navigator !== "undefined" && !navigator.onLine))
            ? e
            : { statut: "erreur", message: messageErreur(err), expiree: estSessionExpiree(err) },
        ),
    );
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tour]);
  const recharger = useCallback(() => setTour((n) => n + 1), []);
  return { etat, recharger };
}

/** Exécute une écriture ; refuse un second appui tant que la première n'a pas répondu. */
export function useAction() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const verrou = useRef(false);
  const lancer = useCallback(async <T,>(fn: () => Promise<T>, messageSucces?: string): Promise<T | undefined> => {
    if (verrou.current) return undefined;
    verrou.current = true;
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    try {
      const r = await fn();
      if (messageSucces) setSucces(messageSucces);
      return r;
    } catch (err) {
      // Gardé sur le téléphone faute de réseau : information, pas une erreur,
      // et jamais présenté comme transmis.
      if (err instanceof EnFileAttente) setSucces(err.message);
      else setErreur(messageErreur(err));
      return undefined;
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }, []);
  return { enCours, erreur, succes, lancer, effacer: () => (setErreur(null), setSucces(null)) };
}

export function Retour({ erreur, succes }: { readonly erreur: string | null; readonly succes?: string | null }) {
  return (
    <>
      {erreur ? (
        <p className="msg msg--erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      {succes ? (
        <p className="msg msg--succes" role="status">
          {succes}
        </p>
      ) : null}
    </>
  );
}

export function Charge<T>({ etat, recharger, children }: { readonly etat: Etat<T>; readonly recharger: () => void; readonly children: (d: T) => ReactNode }) {
  const { tx } = useTextes();
  if (etat.statut === "chargement") {
    return (
      <p className="msg msg--chargement" role="status" aria-busy="true">
        <SymboleKombe taille={30} attente />
        {tx("app.chargement")}
      </p>
    );
  }
  if (etat.statut === "erreur") {
    return (
      <div className="msg msg--erreur" role="alert">
        <p>{etat.expiree ? tx("app.sessionExpiree") : etat.message}</p>
        {etat.expiree ? null : (
          <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={recharger}>
            {tx("app.reessayer")}
          </button>
        )}
      </div>
    );
  }
  return <>{children(etat.donnees)}</>;
}

export function Carte({ titre, children, actions, id }: { readonly titre?: ReactNode; readonly children: ReactNode; readonly actions?: ReactNode; readonly id?: string }) {
  return (
    <section className="tcarte" {...(id ? { "aria-labelledby": id } : {})}>
      {titre || actions ? (
        <header className="tcarte__entete">
          {titre ? <h3 {...(id ? { id } : {})}>{titre}</h3> : null}
          {actions ? <div className="tcarte__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Pastille d'état : texte + forme, jamais la couleur seule. */
export function Pastille({ ton, children }: { readonly ton: "neutre" | "attente" | "ok" | "alerte"; readonly children: ReactNode }) {
  const forme = ton === "ok" ? "●" : ton === "attente" ? "◐" : ton === "alerte" ? "▲" : "○";
  return (
    <span className={`pastille pastille--${ton}`}>
      <span aria-hidden="true">{forme} </span>
      {children}
    </span>
  );
}

export function Champ({
  id,
  libelle,
  aide,
  children,
}: {
  readonly id: string;
  readonly libelle: string;
  readonly aide?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      {children}
      {aide ? (
        <p className="aide-champ" id={`${id}-aide`}>
          {aide}
        </p>
      ) : null}
    </div>
  );
}

/** Saisie d'un montant entier XAF (clavier numérique, chiffres seulement). */
export function ChampMontant({ id, libelle, valeur, onChange, aide }: { readonly id: string; readonly libelle: string; readonly valeur: string; readonly onChange: (v: string) => void; readonly aide?: string }) {
  return (
    <Champ id={id} libelle={libelle} aide={aide}>
      <input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={valeur}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))}
        {...(aide ? { "aria-describedby": `${id}-aide` } : {})}
      />
    </Champ>
  );
}

export function aujourdhui(): string {
  // Date du jour à Douala (UTC+1, sans heure d'été).
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
