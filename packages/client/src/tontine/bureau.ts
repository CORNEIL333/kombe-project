/* KÓMBE — accès au tableau de bord du bureau (/bureau/) depuis le PWA.
   Même origine : la session du PWA est confiée à l'onglet (sessionStorage,
   clé du tableau de bord) puis l'onglet navigue vers /bureau/. Aucun jeton
   dans l'URL ; fermer l'onglet ferme la session du bureau. */

import type { GroupRole } from "@kombe/domain";
import type { Session } from "./api.js";

/** Fonctions qui donnent accès au tableau de bord du bureau. */
export const ROLES_BUREAU: readonly GroupRole[] = ["animator", "vice_president", "secretary", "treasurer", "treasurer_deputy", "auditor", "censor", "advisor"];

export function estBureau(roles: readonly GroupRole[]): boolean {
  return roles.some((r) => ROLES_BUREAU.includes(r));
}

export function ouvrirBureau(session: Session, groupId?: string): void {
  try {
    window.sessionStorage.setItem(
      "kombe.dashboard.session",
      JSON.stringify({ identityId: session.identityId, sessionId: session.sessionId, expiresAt: session.expiresAt }),
    );
    if (groupId) window.localStorage.setItem("kombe.bureau.groupe", groupId);
  } catch {
    /* stockage indisponible : le bureau demandera simplement un code */
  }
  window.location.assign("/bureau/");
}
