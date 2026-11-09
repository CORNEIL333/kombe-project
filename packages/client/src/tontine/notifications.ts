/* KÓMBE — notifications lisibles et cliquables (ADR-0042) : un titre précis
   par type (et par palier de relance), une ligne de détail tirée de `params`
   (groupe, échéance, tour, montant…), et l'écran à ouvrir d'après `target`
   (« /tontines/<groupe>/<section>[/<objet>] »). Le titre ne porte ni montant
   ni nom quand il pourrait s'afficher hors de l'application (ADR-0016) ; le
   détail, lui, n'est lu qu'ici, après authentification. */

import type { NotificationView } from "@kombe/domain";
import type { CleTexte } from "./textes.js";
import type { NomIcone } from "../composants/Icones.js";

/** Section de l'API → onglet de la PWA. */
const SECTIONS: Readonly<Record<string, string>> = {
  calendrier: "tours",
  tours: "tours",
  argent: "argent",
  seances: "seances",
  membres: "membres",
  statuts: "statuts",
  decisions: "decisions",
  votes: "decisions",
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

/* ── Catalogue par nature (`topic`, préfixe de la clé de dédoublonnage) et
   destination contrôlée (bon groupe, bon onglet). Même vocabulaire que l'app
   mobile. Ouvrir une notification ne décide rien : on arrive là où l'action se
   fait, et le serveur re-vérifie les droits. */


/** Destination d'une notification, dans le vocabulaire des routes du PWA. */
export type DestinationNotification =
  | { readonly ecran: "groupe"; readonly groupId: string; readonly onglet: string }
  | { readonly ecran: "validations" }
  | { readonly ecran: "cotisations" }
  | { readonly ecran: "aide"; readonly demande: string };

const CATALOGUE: Readonly<Record<string, { readonly cle: CleTexte; readonly icone: NomIcone }>> = {
  declared: { cle: "nt.declared", icone: "validations" },
  toControl: { cle: "nt.toControl", icone: "validations" },
  rejected: { cle: "nt.rejected", icone: "alerte" },
  due: { cle: "nt.due", icone: "declarer" },
  payout: { cle: "nt.payout", icone: "cagnotte" },
  received: { cle: "nt.received", icone: "cagnotte" },
  reserve: { cle: "nt.reserve", icone: "cagnotte" },
  fund: { cle: "nt.fund", icone: "cagnotte" },
  decision: { cle: "nt.decision", icone: "vote" },
  "decision-closed": { cle: "nt.decisionClosed", icone: "vote" },
  "decision-lifted": { cle: "nt.decisionLifted", icone: "vote" },
  fine: { cle: "nt.fine", icone: "balance" },
  fineDecision: { cle: "nt.fineDecision", icone: "balance" },
  contest: { cle: "nt.contest", icone: "balance" },
  aid: { cle: "nt.aid", icone: "secours" },
  aidDecision: { cle: "nt.aidDecision", icone: "secours" },
  aidPaid: { cle: "nt.aidPaid", icone: "secours" },
  meetingSoon: { cle: "nt.meetingSoon", icone: "seance" },
  minutes: { cle: "nt.minutes", icone: "seance" },
  statutes: { cle: "nt.statutes", icone: "document" },
  admission: { cle: "nt.admission", icone: "personnes" },
  join: { cle: "nt.join", icone: "personnes" },
  role: { cle: "nt.role", icone: "bureau" },
  cycle: { cle: "nt.cycle", icone: "cycle" },
  draw: { cle: "nt.draw", icone: "cycle" },
  swap: { cle: "nt.swap", icone: "cycle" },
  "swap-ready": { cle: "nt.swapReady", icone: "cycle" },
  "swap-applied": { cle: "nt.swapApplied", icone: "cycle" },
};

/** Repli par catégorie serveur (serveur antérieur sans `topic`). */
const PAR_CATEGORIE: Readonly<Record<string, CleTexte>> = {
  due_reminder: "notif.due_reminder",
  meeting_reminder: "notif.meeting_reminder",
  validation_waiting: "notif.validation_waiting",
  payout_recorded: "notif.payout_recorded",
  fine_issued: "notif.fine_issued",
  aid_decided: "notif.aid_decided",
  order_change: "notif.order_change",
  membership: "notif.membership",
  minutes_ready: "notif.minutes_ready",
  decision: "notif.decision",
};

export function entreeNotification(n: { readonly topic?: string | null; readonly kind?: string }): { readonly cle: CleTexte; readonly icone: NomIcone } {
  const exacte = CATALOGUE[n.topic ?? ""];
  if (exacte) return exacte;
  const categorie = PAR_CATEGORIE[n.kind ?? ""];
  return categorie ? { cle: categorie, icone: "cloche" } : { cle: "nt.autre", icone: "cloche" };
}

/** Onglet du groupe où se fait l'action (les ids d'onglets de `Groupe.tsx`). */
const ONGLET: Readonly<Record<string, string>> = {
  rejected: "argent",
  due: "argent",
  payout: "argent",
  received: "argent",
  reserve: "argent",
  fund: "argent",
  decision: "decisions",
  "decision-closed": "decisions",
  "decision-lifted": "decisions",
  fine: "discipline",
  fineDecision: "discipline",
  contest: "discipline",
  aid: "discipline",
  aidDecision: "discipline",
  aidPaid: "discipline",
  meetingSoon: "seances",
  minutes: "seances",
  statutes: "statuts",
  admission: "apercu",
  join: "membres",
  role: "membres",
  cycle: "tours",
  draw: "tours",
  swap: "tours",
  "swap-ready": "tours",
  "swap-applied": "tours",
  // Échéances et relances (ADR-0042)
  statutesRemind: "statuts",
  statutesManual: "statuts",
  statutesDeadline: "statuts",
  statutesExpired: "statuts",
  statutesExcluded: "apercu",
  meetingOpen: "seances",
  voteSoon: "decisions",
  roleRemind: "membres",
};

export function destinationNotification(n: {
  readonly topic?: string | null;
  readonly groupId: string | null;
  readonly target?: string | null;
}): DestinationNotification | null {
  if (n.topic === "declared" || n.topic === "toControl") return { ecran: "validations" };
  // Réponse du support (CRM) : la demande, jamais un groupe.
  const demande = /^\/aide\/demandes\/(tk_[0-9a-f]{20})$/.exec(n.target ?? "");
  if (demande?.[1]) return { ecran: "aide", demande: demande[1] };
  if (!n.groupId) return null;
  // Nature connue → son onglet ; sinon la cible posée par le serveur (ADR-0042).
  return { ecran: "groupe", groupId: n.groupId, onglet: ONGLET[n.topic ?? ""] ?? ongletDe({ target: n.target ?? null }) ?? "apercu" };
}
