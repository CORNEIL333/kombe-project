/**
 * Règlement d'une association (TontineSettings) : validation stricte des
 * entrées (zod), bornes alignées sur le domaine et les CHECK SQL, valeurs par
 * défaut camerounaises courantes, conversion vers les types du domaine.
 */
import { z } from "zod";
import {
  AID_EVENTS,
  DomainError,
  assertAidScale,
  assertCadence,
  assertFineSchedule,
  perAmount,
  type AidScale,
  type Cadence,
  type FineSchedule,
  type TontineSettings,
} from "@kombe/domain";

/** Bornes uniques (I-03) : formulaires, domaine, SQL et OpenAPI les partagent. */
export const MEMBER_BOUNDS = { min: 2, max: 60 } as const;

const moneyStr = z.string().regex(/^\d{1,10}$/, "Montant entier XAF");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const weekday = z.number().int().min(0).max(6);

export const cadenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily"), excludedWeekdays: z.array(weekday).max(6).optional() }),
  z.object({ kind: z.literal("every_n_days"), n: z.number().int().min(2).max(31) }),
  z.object({ kind: z.literal("weekly"), weekday }),
  z.object({ kind: z.literal("biweekly"), weekday }),
  z.object({ kind: z.literal("monthly_day"), day: z.number().int().min(1).max(31) }),
  z.object({
    kind: z.literal("monthly_nth_weekday"),
    nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
    weekday,
  }),
]);

const sideFund = z.object({ enabled: z.boolean(), perMeeting: moneyStr });

export const settingsSchema = z.object({
  contributionPerShare: moneyStr,
  cadence: cadenceSchema,
  firstMeetingDate: isoDate,
  deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  meetingPlace: z.string().trim().max(120).nullable(),
  maxMembers: z.number().int().min(MEMBER_BOUNDS.min).max(MEMBER_BOUNDS.max),
  transparency: z.enum(["all_members", "bureau_only", "anonymized"]),
  feeBearer: z.enum(["member", "beneficiary", "fund"]),
  payoutPolicy: z.enum(["full_with_advance", "reduced", "wait"]),
  newcomersLast: z.boolean(),
  guarantorRequired: z.boolean(),
  payoutWitnesses: z.number().int().min(0).max(5),
  fines: z.object({
    lateContributionFixed: moneyStr,
    lateContributionPerDay: moneyStr,
    lateContributionCap: moneyStr,
    meetingLate: moneyStr,
    meetingAbsence: moneyStr,
    indisciplineCap: moneyStr,
    graceDays: z.number().int().min(0).max(30),
  }),
  solidarity: sideFund.extend({
    scale: z
      .array(z.object({ event: z.enum(AID_EVENTS), amount: moneyStr, maxPerYear: z.number().int().min(0).max(52) }))
      .max(AID_EVENTS.length),
  }),
  operating: sideFund,
  yearEndReserve: sideFund,
});

/** Règlement par défaut proposé par l'assistant de création. */
export function defaultSettings(today: string): TontineSettings {
  return {
    contributionPerShare: "10000",
    cadence: { kind: "weekly", weekday: 0 },
    firstMeetingDate: today,
    deadlineTime: "18:00",
    meetingPlace: null,
    maxMembers: 12,
    transparency: "all_members",
    feeBearer: "member",
    payoutPolicy: "full_with_advance",
    newcomersLast: true,
    guarantorRequired: false,
    payoutWitnesses: 2,
    fines: {
      lateContributionFixed: "0",
      lateContributionPerDay: "0",
      lateContributionCap: "0",
      meetingLate: "0",
      meetingAbsence: "0",
      indisciplineCap: "0",
      graceDays: 2,
    },
    solidarity: {
      enabled: true,
      perMeeting: "1000",
      scale: [
        { event: "death_member", amount: "100000", maxPerYear: 1 },
        { event: "death_spouse", amount: "50000", maxPerYear: 1 },
        { event: "death_parent", amount: "30000", maxPerYear: 2 },
        { event: "death_child", amount: "30000", maxPerYear: 2 },
        { event: "birth", amount: "15000", maxPerYear: 2 },
        { event: "marriage", amount: "20000", maxPerYear: 1 },
        { event: "illness", amount: "20000", maxPerYear: 2 },
      ],
    },
    operating: { enabled: true, perMeeting: "500" },
    yearEndReserve: { enabled: false, perMeeting: "0" },
  };
}

export function fineScheduleOf(s: TontineSettings): FineSchedule {
  return {
    lateContributionFixed: BigInt(s.fines.lateContributionFixed),
    lateContributionPerDay: BigInt(s.fines.lateContributionPerDay),
    lateContributionCap: BigInt(s.fines.lateContributionCap),
    meetingLate: BigInt(s.fines.meetingLate),
    meetingAbsence: BigInt(s.fines.meetingAbsence),
    indisciplineCap: BigInt(s.fines.indisciplineCap),
    graceDays: s.fines.graceDays,
  };
}

export function aidScaleOf(s: TontineSettings): AidScale {
  return s.solidarity.scale.map((e) => ({ event: e.event, amount: BigInt(e.amount), maxPerYear: e.maxPerYear }));
}

/** Validation métier complète (au-delà de la forme) : cadence, barèmes, montants. */
export function assertSettings(s: TontineSettings): void {
  assertCadence(s.cadence as Cadence);
  perAmount(BigInt(s.contributionPerShare), { positive: true });
  assertFineSchedule(fineScheduleOf(s));
  assertAidScale(aidScaleOf(s));
  for (const f of [s.solidarity, s.operating, s.yearEndReserve]) perAmount(BigInt(f.perMeeting));
  if (s.solidarity.enabled && s.solidarity.scale.length === 0 && BigInt(s.solidarity.perMeeting) === 0n) {
    throw new DomainError("AID_INVALID", "Caisse de secours sans cotisation ni barème");
  }
}

export function parseSettings(raw: unknown): TontineSettings {
  const parsed = settingsSchema.parse(raw) as TontineSettings;
  assertSettings(parsed);
  return parsed;
}
