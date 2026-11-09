/**
 * Statuts et règlement intérieur (lot L-12, ADR-0031).
 *
 * Le document est GÉNÉRÉ depuis les règles versionnées (caisses, barèmes,
 * bureau, sanctions, calendrier) : il ne peut pas dire autre chose que ce que
 * le registre applique. Chaque membre accepte l'empreinte exacte du texte à
 * son adhésion. La mention de la loi n° 90/053 du 19 décembre 1990 sur la
 * liberté d'association est INDICATIVE : aucune valeur juridique n'est
 * promise, la déclaration en préfecture reste une démarche du groupe.
 */
import { canonicalHash } from "../canonical.js";
import { describeCadence, type Cadence } from "./cadence.js";
import { FUND_LABELS, type FundKind, type WithdrawalFeeBearer } from "./funds.js";
import { FINE_LABELS, type FineSchedule } from "./discipline.js";
import { AID_LABELS, type AidScale } from "./solidarity.js";
import { ROLE_LABELS, type GroupRole } from "./roles.js";

export interface StatutesInput {
  readonly groupName: string;
  readonly seat: string | null;
  readonly purpose: string | null;
  readonly cadence: Cadence;
  readonly meetingPlace: string | null;
  readonly funds: readonly { readonly kind: FundKind; readonly name: string; readonly perMeetingAmount: bigint; readonly annualAmount: bigint }[];
  readonly rotationContribution: bigint | null;
  readonly fines: FineSchedule;
  readonly aidScale: AidScale;
  readonly bureau: readonly { readonly role: GroupRole; readonly name: string; readonly mandateEnd: string | null }[];
  readonly feeBearer: WithdrawalFeeBearer;
  readonly transparency: Transparency;
  readonly guarantorRequired: boolean;
  readonly newcomersLast: boolean;
  readonly rulesVersion: number;
  /** Témoins présents exigés pour une remise (règlement) ; 2 si non précisé. */
  readonly payoutWitnesses?: number;
  /** Délai d'acceptation des statuts et conséquence (ADR-0042). */
  readonly acceptance?: { readonly days: number; readonly onExpiry: "exclude" | "keep" };
}

export type Transparency = "all_members" | "bureau_only" | "anonymized";

export interface StatutesDocument {
  readonly title: string;
  readonly text: string;
  readonly hash: string;
}

function xaf(n: bigint): string {
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

const FEE_FR: Readonly<Record<WithdrawalFeeBearer, string>> = {
  member: "par le membre qui verse",
  beneficiary: "par le bénéficiaire, déduits de la remise",
  fund: "par la caisse",
};

const TRANSPARENCY_FR: Readonly<Record<Transparency, string>> = {
  all_members: "tous les membres voient qui a cotisé et qui est en attente",
  bureau_only: "seul le bureau voit le détail par membre ; chacun voit sa propre situation",
  anonymized: "les membres voient le nombre de cotisations reçues, sans les noms",
};

export function buildStatutes(s: StatutesInput): StatutesDocument {
  const L: string[] = [];
  const title = `Statuts et règlement intérieur — ${s.groupName}`;
  L.push(title.toUpperCase());
  L.push(`Version des règles : ${s.rulesVersion}`);
  L.push("");
  L.push("TITRE I — DISPOSITIONS GÉNÉRALES");
  L.push(`Article 1. Il est constitué entre les membres une association dénommée « ${s.groupName} »${s.seat ? `, dont le siège est à ${s.seat}` : ""}.`);
  L.push(`Article 2. Objet : ${s.purpose ?? "l'entraide entre membres par la tontine et les caisses décrites ci-dessous"}.`);
  L.push("Article 3. Le groupe se réfère à la loi n° 90/053 du 19 décembre 1990 sur la liberté d'association. Ce document est généré par KÓMBE à titre de modèle ; il n'a pas de valeur juridique par lui-même. KÓMBE tient le registre du groupe et ne garde pas son argent.");
  L.push("");
  L.push("TITRE II — SÉANCES");
  L.push(`Article 4. Les séances ont lieu : ${describeCadence(s.cadence, "fr").toLowerCase()}${s.meetingPlace ? `, à ${s.meetingPlace}` : ", chez le membre désigné comme hôte"}.`);
  const w = s.payoutWitnesses ?? 2;
  const temoins = w === 0 ? "aux remises notées en séance" : w === 1 ? "aux remises devant au moins un témoin présent" : `aux remises devant au moins ${w} témoins présents`;
  L.push(`Article 5. Chaque séance donne lieu à un appel, à la collecte, ${temoins} et à un procès-verbal approuvé à la séance suivante.`);
  L.push("");
  L.push("TITRE III — CAISSES");
  let art = 6;
  if (s.rotationContribution !== null) {
    L.push(`Article ${art++}. Tontine (njangi) : chaque part cotise ${xaf(s.rotationContribution)} par séance ; à chaque séance, la cagnotte est remise au titulaire du tour.`);
  }
  for (const f of s.funds.filter((x) => x.kind !== "rotation")) {
    const parts: string[] = [];
    if (f.perMeetingAmount > 0n) parts.push(`${xaf(f.perMeetingAmount)} par séance`);
    if (f.annualAmount > 0n) parts.push(`${xaf(f.annualAmount)} par an`);
    L.push(`Article ${art++}. ${FUND_LABELS[f.kind].fr} « ${f.name} »${parts.length ? ` : cotisation de ${parts.join(" et ")}` : ""}.`);
  }
  L.push(`Article ${art++}. Les frais Mobile Money (envoi et cash-out) sont supportés ${FEE_FR[s.feeBearer]}.`);
  L.push(`Article ${art++}. Transparence : ${TRANSPARENCY_FR[s.transparency]}.`);
  L.push("");
  L.push("TITRE IV — SECOURS");
  if (s.aidScale.length === 0) {
    L.push(`Article ${art++}. Aucun secours n'est prévu à ce jour.`);
  } else {
    L.push(`Article ${art++}. La caisse de secours verse, sur décision du bureau ou vote, les montants suivants :`);
    for (const e of s.aidScale) {
      L.push(`   - ${AID_LABELS[e.event].fr} : ${xaf(e.amount)}${e.maxPerYear > 0 ? ` (au plus ${e.maxPerYear} fois par an)` : ""}`);
    }
  }
  L.push("");
  L.push("TITRE V — DISCIPLINE");
  L.push(`Article ${art++}. Délai de grâce : ${s.fines.graceDays} jour(s) après l'échéance.`);
  const fineLines: string[] = [];
  if (s.fines.lateContributionFixed > 0n || s.fines.lateContributionPerDay > 0n) {
    fineLines.push(
      `${FINE_LABELS.late_contribution.fr} : ${xaf(s.fines.lateContributionFixed)}${s.fines.lateContributionPerDay > 0n ? ` + ${xaf(s.fines.lateContributionPerDay)} par jour` : ""}${s.fines.lateContributionCap > 0n ? `, plafonné à ${xaf(s.fines.lateContributionCap)}` : ""}`,
    );
  }
  if (s.fines.meetingLate > 0n) fineLines.push(`${FINE_LABELS.meeting_late.fr} : ${xaf(s.fines.meetingLate)}`);
  if (s.fines.meetingAbsence > 0n) fineLines.push(`${FINE_LABELS.meeting_absence.fr} : ${xaf(s.fines.meetingAbsence)}`);
  if (s.fines.indisciplineCap > 0n) fineLines.push(`${FINE_LABELS.indiscipline.fr} : au plus ${xaf(s.fines.indisciplineCap)}`);
  if (fineLines.length === 0) {
    L.push(`Article ${art++}. Aucune amende n'est prévue à ce jour.`);
  } else {
    L.push(`Article ${art++}. Le censeur constate les manquements suivants ; toute amende peut être contestée :`);
    for (const f of fineLines) L.push(`   - ${f}`);
  }
  L.push(`Article ${art++}. Sanctions graduées : avertissement, amende, suspension du droit de bénéficier, puis exclusion par vote.`);
  if (s.guarantorRequired) L.push(`Article ${art++}. Tout nouveau membre est présenté par un avaliseur, membre actif, qui répond de lui.`);
  if (s.newcomersLast) L.push(`Article ${art++}. Les nouveaux membres bénéficient après les anciens.`);
  L.push("");
  L.push("TITRE VI — BUREAU");
  if (s.bureau.length === 0) L.push(`Article ${art++}. Le bureau reste à désigner.`);
  for (const b of s.bureau) {
    L.push(`   - ${ROLE_LABELS[b.role].fr} : ${b.name}${b.mandateEnd ? ` (mandat jusqu'au ${b.mandateEnd})` : ""}`);
  }
  L.push(`Article ${art++}. Le bureau est élu par vote. Tout membre peut proposer la destitution d'un membre du bureau ; elle est adoptée à la majorité absolue des membres, après au moins 72 heures de vote.`);
  L.push("");
  L.push("TITRE VII — DÉPART ET LITIGES");
  L.push(`Article ${art++}. Un membre qui part reste tenu des obligations déjà nées. Un repreneur peut prendre sa place avec l'accord du groupe.`);
  L.push(`Article ${art++}. Tout litige est ouvert dans le registre et examiné par des membres non impliqués.`);
  if (s.acceptance) {
    const suite =
      s.acceptance.onExpiry === "exclude"
        ? "passé ce délai, et tant que le cycle n'a pas démarré, il est exclu de l'association (la présidence en est exemptée)"
        : "passé ce délai, le bureau en est informé et décide de la suite";
    L.push(
      `Article ${art++}. Chaque membre accepte les présents statuts dans les ${s.acceptance.days} jours qui suivent leur publication ou son admission ; ${suite}. Des rappels lui sont adressés à l'approche de l'échéance.`,
    );
  }
  const text = L.join("\n");
  return { title, text, hash: canonicalHash({ text }) };
}
