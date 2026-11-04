/* KÓMBE — groupe actif : celui que la personne a CHOISI (mémorisé sur
   l'appareil), jamais « le premier renvoyé » sans le dire. Même règle que
   l'app mobile (ActiveGroupController). Effacé à la déconnexion. */

import { useCallback, useEffect, useState } from "react";
import { acces, type Session, type TontineSummary } from "./api.js";

const CLE = "kombe.groupe_actif";

function lire(): string | null {
  try {
    return window.localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

export function oublierGroupeActif(): void {
  try {
    window.localStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible : rien à effacer */
  }
}

export interface GroupeActif {
  /** null = chargement en cours. */
  readonly groupes: readonly TontineSummary[] | null;
  readonly erreur: boolean;
  readonly actif: TontineSummary | null;
  readonly choisir: (groupId: string) => void;
  readonly recharger: () => void;
}

export function useGroupeActif(session: Session | null): GroupeActif {
  const [groupes, setGroupes] = useState<readonly TontineSummary[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [choix, setChoix] = useState<string | null>(() => lire());
  const [jeton, setJeton] = useState(0);

  useEffect(() => {
    if (!session) {
      setGroupes(null);
      return;
    }
    let vivant = true;
    acces.mesTontines(session).then(
      (l) => {
        if (!vivant) return;
        setGroupes(l);
        setErreur(false);
      },
      // Une erreur de rafraîchissement ne vide pas ce qui est affiché.
      () => vivant && setErreur(true),
    );
    return () => {
      vivant = false;
    };
  }, [session, jeton]);

  // Une photo changée ailleurs (fiche du groupe) : on relit la liste.
  useEffect(() => {
    const relire = () => setJeton((n) => n + 1);
    window.addEventListener("kombe:groupes", relire);
    return () => window.removeEventListener("kombe:groupes", relire);
  }, []);

  const choisir = useCallback((groupId: string) => {
    setChoix(groupId);
    try {
      window.localStorage.setItem(CLE, groupId);
    } catch {
      /* choix gardé pour la session seulement */
    }
  }, []);

  const actifs = (groupes ?? []).filter((g) => g.membershipState === "active");
  const actif = actifs.find((g) => g.groupId === choix) ?? actifs[0] ?? null;
  return { groupes, erreur, actif, choisir, recharger: () => setJeton((n) => n + 1) };
}
