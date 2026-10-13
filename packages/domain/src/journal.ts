/**
 * C11 — Journal d'événements : enveloppe riche, replay versionné, checkpoints
 * hors privilèges applicatifs, outil de vérification indépendant et timeline
 * filtrée par droits (stories 9.1–9.5).
 *
 * Réutilise la chaîne de hash scellée de C00 (`sealEvent`/`verifyChain`,
 * profil canonique RFC 8785, genèse fixe) sans la redéfinir. L'enveloppe
 * ajoute les champs exigés par 9.1 — acteur interne, rôle instantané, date
 * serveur, commande/corrélation — SANS toucher au profil de hash : ces champs
 * vivent dans le `payload` scellé, seule la structure d'enveloppe les expose
 * typés. Aucun total n'est stocké ailleurs que reconstruit par replay (9.5).
 */
import { GENESIS_HASH, canonicalHash } from "./canonical.js";
import {
  sealEvent,
  verifyEventIntegrity,
  type JournalEvent,
} from "./events.js";
import { DomainError } from "./errors.js";

/* ── Enveloppe d'événement (9.1) ──────────────────────────────────────────── */

/** Rôle instantané capturé à l'écriture — pas une référence mutable. */
export type JournalRole =
  | "founder"
  | "animator"
  | "treasurer"
  | "secretary"
  | "auditor"
  | "member";

/**
 * Événement du journal : la structure scellée par C00 plus l'enveloppe
 * métier typée. Les champs d'enveloppe sont portés par le payload scellé ;
 * le hash couvre donc acteur, rôle, date serveur et corrélation.
 */
export interface JournalEventV1 {
  readonly groupId: string;
  readonly seq: number;
  readonly type: string;
  readonly version: number;
  readonly previousHash: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly hash: string;
  /* Enveloppe (typée, présente dans payload au scellement). */
  readonly actorIdentityId: string;
  readonly actorRole: JournalRole;
  readonly serverDate: string;
  readonly commandId: string;
  readonly correlationId?: string;
  readonly rulesVersion?: number;
}

/** Scelle un événement en incluant son enveloppe dans le payload haché. */
export function sealEventV1(
  input: Omit<JournalEventV1, "hash" | "payload"> & {
    readonly body: Readonly<Record<string, unknown>>;
  },
): JournalEventV1 {
  const envelope = {
    actorIdentityId: input.actorIdentityId,
    actorRole: input.actorRole,
    serverDate: input.serverDate,
    commandId: input.commandId,
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.rulesVersion !== undefined ? { rulesVersion: input.rulesVersion } : {}),
  };
  const sealed = sealEvent({
    groupId: input.groupId,
    seq: input.seq,
    type: input.type,
    version: input.version,
    previousHash: input.previousHash,
    payload: { ...envelope, body: input.body },
  });
  return { ...sealed, ...envelope };
}

/* ── Replay versionné et projections (9.5) ───────────────────────────────── */

/**
 * Projection reconstruite par replay des événements validés et compensations.
 * Aucun champ agrégé n'est stocké hors replay : `validatedNet` et
 * `declaredReserved` naissent uniquement des événements.
 */
export interface ObligationProjection {
  readonly obligationId: string;
  /** Somme validée nette (validations moins compensations). */
  readonly validatedNet: bigint;
  /** Somme déclarée en cours (réservations actives). */
  readonly declaredReserved: bigint;
  /** Version d'objet atteinte (dernière séquence rejouée pour l'obligation). */
  readonly version: number;
}

export interface ReplayState {
  readonly replayVersion: number;
  readonly throughSeq: number;
  readonly obligations: ReadonlyMap<string, ObligationProjection>;
}

/** Version du replay en cours ; un rejoueur ne traite jamais une version
 *  future inconnue silencieusement (replay versionné, contrainte C11). */
export const REPLAY_VERSION = 1;

/** Montant du payload (bigint scellé ou nombre sûr relu) → bigint entier. */
function payloadAmount(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  throw new DomainError("REPLAY_VERSION_UNKNOWN", "Montant de payload invalide au replay");
}

function bumpObligation(
  into: Map<string, ObligationProjection>,
  obligationId: string,
  patch: Partial<Omit<ObligationProjection, "obligationId">>,
): void {
  const prev = into.get(obligationId) ?? {
    obligationId,
    validatedNet: 0n,
    declaredReserved: 0n,
    version: 0,
  };
  into.set(obligationId, {
    obligationId,
    validatedNet: patch.validatedNet ?? prev.validatedNet,
    declaredReserved: patch.declaredReserved ?? prev.declaredReserved,
    version: prev.version + 1,
  });
}

/**
 * Rejoue une chaîne d'événements à `REPLAY_VERSION` et reconstruit les
 * projections d'obligations. Les types non pertinents pour cette projection
 * sont ignorés explicitement (jamais par défaut silencieux muet : ils passent
 * par le compteur de séquence).
 */
export function replayJournal(events: readonly JournalEvent[]): ReplayState {
  if (events.some((e) => e.version > REPLAY_VERSION)) {
    throw new DomainError(
      "REPLAY_VERSION_UNKNOWN",
      "Version d'événement inconnue du rejoueur — migration de payload requise",
    );
  }
  const obligations = new Map<string, ObligationProjection>();
  for (const ev of events) {
    const payload = ev.payload as Record<string, unknown>;
    const body = (payload["body"] ?? payload) as Record<string, unknown>;
    switch (ev.type) {
      case "contribution.declared": {
        const obligationId = String(body["obligationId"]);
        const amount = payloadAmount(body["amount"]);
        const cur = obligations.get(obligationId);
        bumpObligation(obligations, obligationId, {
          declaredReserved: (cur?.declaredReserved ?? 0n) + amount,
          validatedNet: cur?.validatedNet ?? 0n,
        });
        break;
      }
      case "contribution.validated": {
        const obligationId = String(body["obligationId"]);
        const amount = payloadAmount(body["amount"]);
        const cur = obligations.get(obligationId);
        bumpObligation(obligations, obligationId, {
          validatedNet: (cur?.validatedNet ?? 0n) + amount,
          declaredReserved: cur?.declaredReserved ?? 0n,
        });
        break;
      }
      case "contribution.compensated": {
        // Compensation : retracte le validé net (jamais d'effacement).
        const obligationId = String(body["obligationId"]);
        const amount = payloadAmount(body["amount"]);
        const cur = obligations.get(obligationId);
        bumpObligation(obligations, obligationId, {
          validatedNet: (cur?.validatedNet ?? 0n) - amount,
          declaredReserved: cur?.declaredReserved ?? 0n,
        });
        break;
      }
      default:
        // Type sans incidence sur cette projection : ignoré, pas de total.
        break;
    }
  }
  const lastSeq = events.length ? (events[events.length - 1] as JournalEvent).seq : 0;
  return Object.freeze({ replayVersion: REPLAY_VERSION, throughSeq: lastSeq, obligations });
}

/* ── Checkpoints hors privilèges app (9.2) ───────────────────────────────── */

/**
 * Point de contrôle externe : empreinte d'un préfixe de chaîne (groupe, seq,
 * headHash), calculée par un vérificateur hors des privilèges applicatifs.
 * Le hash seul n'atteste pas l'origine — la séparation des droits oui :
 * la table `checkpoint` est en lecture seule pour le rôle applicatif (0007).
 */
export interface Checkpoint {
  readonly groupId: string;
  readonly seq: number;
  readonly headHash: string;
  readonly issuedAt: string;
  readonly issuedBy: string;
  readonly hash: string;
}

export type CheckpointInput = Omit<Checkpoint, "hash">;

/** Scelle un checkpoint par hash canonique de ses champs (hors son propre hash). */
export function sealCheckpoint(cp: CheckpointInput): Checkpoint {
  const hash = canonicalHash({
    groupId: cp.groupId,
    seq: cp.seq,
    headHash: cp.headHash,
    issuedAt: cp.issuedAt,
    issuedBy: cp.issuedBy,
  });
  return Object.freeze({ ...cp, hash });
}

/* ── Outil de vérification indépendant (9.2/9.4) ─────────────────────────── */

export interface VerifyOptions {
  readonly checkpoints?: readonly Checkpoint[];
}

export interface VerifyResult {
  readonly intact: boolean;
  readonly throughSeq: number;
  /** Rupture détectée par intégrité de contenu, chaînage ou checkpoint. */
  readonly error?: "EVENT_HASH_MISMATCH" | "EVENT_CHAIN_BREAK" | "CHECKPOINT_MISMATCH";
  readonly detail?: string;
}

/**
 * Vérifie une chaîne d'événements de façon indépendante : intégrité de chaque
 * hash, continuité de genèse en tête, séquence incrémentale, et alignement de
 * chaque checkpoint sur le hash effectif à sa séquence. Ne recalculera jamais
 * une chaîne pour masquer une altération — il ne lit que ce qui est écrit.
 */
export function verifyJournal(
  events: readonly JournalEvent[],
  options: VerifyOptions = {},
): VerifyResult {
  let expectedPrev = GENESIS_HASH;
  let expectedSeq = 1;
  for (const ev of events) {
    try {
      verifyEventIntegrity(ev);
    } catch (e) {
      if (e instanceof DomainError && e.code === "EVENT_HASH_MISMATCH") {
        return { intact: false, throughSeq: ev.seq - 1, error: "EVENT_HASH_MISMATCH", detail: "contenu altéré" };
      }
      throw e;
    }
    if (ev.previousHash !== expectedPrev) {
      return { intact: false, throughSeq: ev.seq - 1, error: "EVENT_CHAIN_BREAK", detail: "maillon déchaîné" };
    }
    if (ev.seq !== expectedSeq) {
      return { intact: false, throughSeq: ev.seq - 1, error: "EVENT_CHAIN_BREAK", detail: "séquence discontinue" };
    }
    expectedPrev = ev.hash;
    expectedSeq += 1;
  }
  // Contrôle indépendant a posteriori : chaque checkpoint doit correspondre
  // au hash EFFECTIVEMENT écrit à sa séquence. Un recalcul « réparant » la
  // chaîne après altération ne trompe pas ce contrôle — le checkpoint vit
  // hors des privilèges applicatifs (9.2 : le hash seul ne garantit pas
  // l'origine ; la séparation des droits oui).
  for (const cp of options.checkpoints ?? []) {
    if (cp.seq > events.length) {
      return { intact: false, throughSeq: events.length, error: "CHECKPOINT_MISMATCH", detail: "checkpoint au-delà du journal" };
    }
    const ev = events[cp.seq - 1] as JournalEvent;
    if (cp.groupId !== ev.groupId || cp.headHash !== ev.hash) {
      return { intact: false, throughSeq: cp.seq, error: "CHECKPOINT_MISMATCH", detail: "checkpoint divergent" };
    }
  }
  return { intact: true, throughSeq: events.length };
}

/* ── Timeline filtrée par droits, langage clair (9.1/9.3) ────────────────── */

const PRIVATE_EVENT_TYPES = new Set(["dispute.opened", "dispute.resolved"]);

/** Rôles autorisés à voir le détail d'un événement privé (litige). */
function maySeePrivate(role: JournalRole): boolean {
  return role === "auditor" || role === "secretary";
}

/** Libellé en langage clair — jamais le jargon technique brut (9.3). */
function plainLabel(ev: JournalEvent): string {
  switch (ev.type) {
    case "contribution.declared":
      return "Cotisation déclarée";
    case "contribution.validated":
      return "Cotisation validée";
    case "contribution.compensated":
      return "Cotisation compensée";
    case "dispute.opened":
      return "Litige ouvert";
    case "dispute.resolved":
      return "Litige résolu";
    default:
      return "Mouvement du registre";
  }
}

export interface TimelineEntry {
  readonly seq: number;
  readonly type: string;
  readonly occurredAt: string;
  readonly label: string;
  /** Résumé minimal, non-divulguant ; payload brut jamais exposé. */
  readonly summary?: Record<string, unknown>;
}

/**
 * Projette une entrée de timeline selon les droits du rôle. Pour un événement
 * privé et un rôle non autorisé, la présence même est masquée (retrait total,
 * pas un payload partiel). Le `summary` n'expose que des champs entiers sûrs.
 */
export function timelineEntry(
  ev: JournalEvent,
  role: JournalRole,
): TimelineEntry | null {
  const isPrivate = PRIVATE_EVENT_TYPES.has(ev.type);
  if (isPrivate && !maySeePrivate(role)) return null;
  const payload = (ev.payload as Record<string, unknown>)["body"] as
    | Record<string, unknown>
    | undefined;
  const base: TimelineEntry = {
    seq: ev.seq,
    type: ev.type,
    occurredAt: String((ev.payload as Record<string, unknown>)["serverDate"] ?? ""),
    label: plainLabel(ev),
  };
  if (isPrivate) return base; // détail complet réservé aux droits ; pas de payload brut
  const amount = payload?.["amount"];
  return typeof amount === "bigint" || typeof amount === "number"
    ? { ...base, summary: { amount } }
    : base;
}

/** Construit la timeline d'une chaîne, filtrée par rôle (9.3). */
export function buildTimeline(
  events: readonly JournalEvent[],
  role: JournalRole,
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const ev of events) {
    const entry = timelineEntry(ev, role);
    if (entry) out.push(entry);
  }
  return out;
}
