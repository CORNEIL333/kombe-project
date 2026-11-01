/* KÓMBE — notifications : libellé exact par nature (`topic`) et destination
   contrôlée (bon groupe, bon onglet). Même vocabulaire que l'app mobile
   (packages/mobile/lib/features/notifications/notification_catalog.dart).
   Ouvrir une notification ne décide rien : on arrive là où l'action se fait,
   et le serveur re-vérifie les droits. */

import type { CleTexte } from "./textes.js";
import type { NomIcone } from "../composants/Icones.js";

/** Destination d'une notification, dans le vocabulaire des routes du PWA. */
export type DestinationNotification =
  | { readonly ecran: "groupe"; readonly groupId: string; readonly onglet: string }
  | { readonly ecran: "validations" }
  | { readonly ecran: "cotisations" };

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
};

export function destinationNotification(n: { readonly topic?: string | null; readonly groupId: string | null }): DestinationNotification | null {
  if (n.topic === "declared" || n.topic === "toControl") return { ecran: "validations" };
  if (!n.groupId) return null;
  return { ecran: "groupe", groupId: n.groupId, onglet: ONGLET[n.topic ?? ""] ?? "apercu" };
}
