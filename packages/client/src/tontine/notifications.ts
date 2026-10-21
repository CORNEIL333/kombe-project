/* KÓMBE — notifications lisibles et cliquables (ADR-0042) : un titre précis
   par type (et par palier de relance), une ligne de détail tirée de `params`
   (groupe, échéance, tour, montant…), et l'écran à ouvrir d'après `target`
   (« /tontines/<groupe>/<section>[/<objet>] »). Le titre ne porte ni montant
   ni nom quand il pourrait s'afficher hors de l'application (ADR-0016) ; le
   détail, lui, n'est lu qu'ici, après authentification. */

import type { NotificationView } from "@kombe/domain";

/** Section de l'API → onglet de la PWA. */
const SECTIONS: Readonly<Record<string, string>> = {
  calendrier: "tours",
  tours: "tours",
  argent: "argent",
  seances: "seances",
  membres: "membres",
  statuts: "statuts",
  decisions: "decisions",
  discipline: "discipline",
  secours: "discipline",
  journal: "journal",
};

/** Onglet à ouvrir pour une notification (null : aperçu du groupe). */
export function ongletDe(n: Pick<NotificationView, "target">): string | null {
  const m = /^\/tontines\/[^/]+\/([a-z]+)/.exec(n.target ?? "");
  return m ? (SECTIONS[m[1] as string] ?? null) : null;
}

export interface OutilsTexte {
  readonly dyn: (cle: string, variables?: Record<string, string | number>) => string;
  readonly instant: (iso: string | null | undefined) => string;
  readonly date: (iso: string | null | undefined) => string;
  readonly xaf: (montant: string) => string;
}

/** Titre et détail affichés. */
export function texteNotification(n: NotificationView, o: OutilsTexte): { titre: string; detail: string } {
  const p = n.params ?? {};
  const str = (k: string): string => (typeof p[k] === "string" ? (p[k] as string) : typeof p[k] === "number" ? String(p[k]) : "");
  const stage = str("stage");
  const v: Record<string, string> = {
    groupe: n.groupName ?? str("groupName"),
    echeance: o.instant(str("deadlineAt") || str("closesAt") || null),
    jour: o.date(str("date") || str("firstDate") || null),
    nom: str("name"),
    fonction: str("role") ? o.dyn(`role.${str("role")}`) : "",
    tour: str("roundSeq") || str("seq"),
    montant: str("remaining") || str("amount") ? o.xaf(str("remaining") || str("amount")) : "",
    heure: str("deadlineTime"),
    cycle: str("cycleNo"),
    tours: str("rounds"),
    lieu: str("place"),
    motif: str("reason"),
    vote: str("decisionKind") ? o.dyn(`dc.k.${str("decisionKind")}`) : "",
    empreinte: str("commitment"),
  };
  // Une donnée absente reste « {x} » dans le modèle : son morceau est retiré plus bas.
  for (const k of Object.keys(v)) if (!v[k]) delete v[k];
  const essai = (cle: string): string | null => {
    const t = o.dyn(cle, v);
    return t === cle ? null : t;
  };
  let variante = stage;
  if (n.kind === "fine_issued" && p.maintained === true) variante = "maintenue";
  if (n.kind === "statutes_excluded" && p.wasApplicant === true) variante = "candidat";
  if (n.kind === "statutes_expired") variante = p.excluded === true ? "exclu" : str("reason");
  const titre = (variante ? essai(`notif.${n.kind}.${variante}`) : null) ?? essai(`notif.${n.kind}`) ?? libelleBrut(n.kind);
  const detailBrut = (variante ? essai(`notifd.${n.kind}.${variante}`) : null) ?? essai(`notifd.${n.kind}`) ?? v.groupe ?? "";
  // Une variable absente laisse « {x} » : on retire ces morceaux et les séparateurs orphelins.
  const detail = detailBrut
    .split(" · ")
    .filter((morceau) => morceau.trim() && !/\{\w+\}/.test(morceau) && !/:\s*$/.test(morceau.trim()))
    .join(" · ");
  return { titre, detail };
}

function libelleBrut(kind: string): string {
  const s = kind.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
