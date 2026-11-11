import Decimal from "decimal.js";
import { z } from "zod";
export const attendanceStatuses = [
  "PRESENT",
  "ABSENT",
  "HALF",
  "LEAVE",
] as const;
export const markStates = [
  "PENDING",
  "GRADED",
  "ABSENT",
  "EXEMPT",
  "WITHHELD",
  "NOT_APPLICABLE",
  "UNKNOWN_LEGACY_BLANK",
] as const;
export const uuid = z.uuid();
export const schoolDate = z.iso.date();
export const attendanceRecord = z.object({
  enrollmentId: uuid,
  status: z.enum(attendanceStatuses),
  remark: z.string().max(1000).optional(),
});
export const attendanceDay = z.object({
  schoolDate,
  version: z.number().int().min(0),
  records: z.array(attendanceRecord).max(500),
});
export const markInput = z
  .object({
    enrollmentId: uuid,
    state: z.enum(markStates),
    awarded: z.number().min(0).max(999999).nullable().optional(),
    reason: z.string().max(1000).optional(),
    version: z.number().int().min(0),
    onLeave: z.boolean().default(false),
    onTime: z.boolean().nullable().optional(),
  })
  .superRefine((v, c) => {
    if (v.onLeave && v.onTime === true)
      c.addIssue({
        code: "custom",
        message: "Exam leave cannot be marked on time",
      });
    if ((v.state === "GRADED") !== (v.awarded != null))
      c.addIssue({
        code: "custom",
        message: "Only GRADED has numeric awarded marks",
      });
    if (v.awarded != null && !new Decimal(v.awarded).mul(100).isInteger())
      c.addIssue({ code: "custom", message: "At most two decimal places" });
  });
export const paperSchema = z.object({
  id: uuid.optional(),
  offeringId: uuid,
  code: z.string().min(1).max(32),
  label: z.string().min(1).max(150),
  max: z
    .number()
    .positive()
    .max(999999)
    .refine((n) => new Decimal(n).mul(100).isInteger()),
  type: z.enum(["WRITTEN", "ORAL", "PRACTICAL", "OTHER"]),
  pattern: z.string().max(300).default(""),
  date: schoolDate.nullable().default(null),
});
export const schemeSchema = z
  .object({
    papers: z.array(paperSchema).min(1).max(80),
    groups: z
      .array(
        z.object({
          name: z.string().min(1).max(150),
          max: z.number().positive(),
          paperCodes: z.array(z.string()).min(1),
        }),
      )
      .length(6),
  })
  .superRefine((s, c) => {
    const codes = s.papers.map((p) => p.code),
      assigned = s.groups.flatMap((g) => g.paperCodes);
    if (
      new Set(codes).size !== codes.length ||
      new Set(assigned).size !== assigned.length ||
      assigned.length !== codes.length ||
      assigned.some((x) => !codes.includes(x))
    )
      c.addIssue({
        code: "custom",
        message: "Each distinct paper must occur in exactly one group",
      });
    for (const g of s.groups) {
      const sum = s.papers
        .filter((p) => g.paperCodes.includes(p.code))
        .reduce((a, p) => a.plus(p.max), new Decimal(0));
      if (!sum.eq(g.max))
        c.addIssue({
          code: "custom",
          message: `Group ${g.name} maxima mismatch`,
        });
    }
  });
export const policySchema = z
  .object({
    attendance: z.object({
      credits: z.record(
        z.enum(attendanceStatuses),
        z.object({
          earned: z.number().nonnegative(),
          possible: z.number().nonnegative(),
        }),
      ),
      zeroDenominator: z.enum(["BLOCK", "SHOW_NA"]),
      backdateDays: z.number().int().nonnegative().max(366),
      decimals: z.number().int().min(0).max(4),
    }),
    grades: z
      .array(
        z.object({
          label: z.string().min(1),
          min: z.number().min(0).max(100),
          max: z.number().positive().max(101),
          pass: z.boolean(),
        }),
      )
      .min(1),
    eligibility: z.enum(["ACTIVE_AT_WINDOW_END", "ANY_ENROLLED_IN_WINDOW"]),
    ranking: z.object({
      tie: z.enum(["COMPETITION", "DENSE"]),
      topN: z.number().int().positive().nullable(),
      onlyPassing: z.boolean(),
    }),
    missing: z.object({
      absent: z.enum(["BLOCK", "ZERO"]),
      exempt: z.enum(["BLOCK", "EXCLUDE"]),
    }),
    passMinimumPercent: z.number().min(0).max(100),
    rounding: z.enum(["HALF_UP", "HALF_EVEN", "DOWN"]),
    paperMinimumPercent: z.number().min(0).max(100).nullable(),
  })
  .superRefine((p, c) => {
    for (const s of attendanceStatuses) {
      const r = p.attendance.credits[s];
      if (r.earned > r.possible)
        c.addIssue({
          code: "custom",
          message: "Earned attendance credit exceeds possible",
        });
    }
    const bands = [...p.grades].sort((a, b) => a.min - b.min);
    if (bands[0].min !== 0 || bands.at(-1)!.max !== 101)
      c.addIssue({
        code: "custom",
        message: "Grades must cover 0 through 100 (last exclusive bound 101)",
      });
    bands.forEach((b, i) => {
      if (b.max <= b.min || (i > 0 && bands[i - 1].max !== b.min))
        c.addIssue({
          code: "custom",
          message: "Grade bands must be contiguous without overlaps",
        });
    });
  });
export type Policy = z.infer<typeof policySchema>;
export type Scheme = z.infer<typeof schemeSchema>;
export type Mark = {
  state: (typeof markStates)[number];
  awarded: number | null;
  onLeave?: boolean;
  onTime?: boolean | null;
};
export function calculate(
  scheme: Scheme,
  marks: Record<string, Mark>,
  policy?: Policy,
) {
  let total = new Decimal(0),
    possible = new Decimal(0);
  const errors: string[] = [];
  const groups = scheme.groups.map((g) => {
    let score = new Decimal(0),
      max = new Decimal(0);
    for (const code of g.paperCodes) {
      const p = scheme.papers.find((x) => x.code === code)!;
      const m = marks[code];
      if (
        m?.state === "GRADED" &&
        m.awarded != null &&
        new Decimal(m.awarded).gte(0) &&
        new Decimal(m.awarded).lte(p.max)
      ) {
        score = score.plus(m.awarded);
        max = max.plus(p.max);
      } else if (m?.state === "ABSENT" && policy?.missing.absent === "ZERO")
        max = max.plus(p.max);
      else if (m?.state === "EXEMPT" && policy?.missing.exempt === "EXCLUDE") {
        /* explicitly excluded */
      } else {
        errors.push(`${code}: ${m?.state ?? "PENDING"}`);
        max = max.plus(p.max);
      }
    }
    total = total.plus(score);
    possible = possible.plus(max);
    return {
      name: g.name,
      awarded: score.toNumber(),
      possible: max.toNumber(),
    };
  });
  const percent = possible.gt(0) ? total.div(possible).mul(100) : null;
  const band =
    policy && percent
      ? policy.grades.find((b) => percent.gte(b.min) && percent.lt(b.max))
      : null;
  const paperFailure =
    policy?.paperMinimumPercent != null &&
    scheme.papers.some((p) => {
      const m = marks[p.code];
      return (
        (m?.state === "GRADED" ||
          (m?.state === "ABSENT" && policy.missing.absent === "ZERO")) &&
        new Decimal(m.awarded ?? 0)
          .div(p.max)
          .mul(100)
          .lt(policy.paperMinimumPercent!)
      );
    });
  return {
    groups,
    total: total.toNumber(),
    possible: possible.toNumber(),
    percent: percent?.toString() ?? null,
    grade: errors.length ? null : (band?.label ?? null),
    passing:
      errors.length === 0 &&
      !!policy &&
      !!percent?.gte(policy?.passMinimumPercent ?? 101) &&
      !paperFailure,
    errors,
  };
}
export function attendancePercent(
  statuses: (typeof attendanceStatuses)[number][],
  policy: Policy["attendance"],
) {
  let earned = new Decimal(0),
    possible = new Decimal(0);
  for (const status of statuses) {
    earned = earned.plus(policy.credits[status].earned);
    possible = possible.plus(policy.credits[status].possible);
  }
  return {
    earned: earned.toNumber(),
    possible: possible.toNumber(),
    percent: possible.isZero()
      ? null
      : earned.div(possible).mul(100).toString(),
  };
}
export function rank<
  T extends {
    percent: string | null;
    passing: boolean;
    onTimeEligible?: boolean;
  },
>(rows: T[], policy: Policy["ranking"]) {
  const sorted = [...rows].sort((a, b) =>
    new Decimal(b.percent ?? -1).cmp(a.percent ?? -1),
  );
  let dense = 0,
    position = 0,
    eligiblePosition = 0,
    previous: string | null = null;
  return sorted.map((row) => {
    if (
      row.percent === null ||
      new Decimal(row.percent).lte(80) ||
      row.onTimeEligible !== true ||
      (policy.onlyPassing && !row.passing)
    )
      return { ...row, rank: null };
    eligiblePosition++;
    if (row.percent !== previous) {
      dense++;
      position = eligiblePosition;
      previous = row.percent;
    }
    const n = policy.tie === "DENSE" ? dense : position;
    return { ...row, rank: n > Math.min(policy.topN ?? 3, 3) ? null : n };
  });
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

export function sumMarks(values: (number | string)[]) {
  return values
    .reduce<Decimal>((total, value) => total.plus(value), new Decimal(0))
    .toNumber();
}

export const classLevelNames = [
  "پریپ اولیٰ",
  "درجہ اولیٰ",
  "درجہ ثانیہ",
  "درجہ ثالثہ",
  "درجہ رابعہ",
  "درجہ خامسہ",
  "درجہ سادسہ",
  "درجہ سابعہ",
  "دورہ حدیث شریف",
] as const;
export const attendancePolicySchema = policySchema.shape.attendance;
export const instituteAttendance = {
  credits: {
    PRESENT: { earned: 1, possible: 1 },
    ABSENT: { earned: 0, possible: 1 },
    HALF: { earned: 0.5, possible: 1 },
    LEAVE: { earned: 0, possible: 0 },
  },
  zeroDenominator: "SHOW_NA" as const,
  backdateDays: 0,
  decimals: 1,
};
export const institutePolicy: Policy = {
  attendance: instituteAttendance,
  grades: [
    { label: "Fail", min: 0, max: 40, pass: false },
    { label: "Pass", min: 40, max: 101, pass: true },
  ],
  eligibility: "ANY_ENROLLED_IN_WINDOW",
  ranking: { tie: "COMPETITION", topN: 3, onlyPassing: true },
  missing: { absent: "BLOCK", exempt: "BLOCK" },
  passMinimumPercent: 40,
  paperMinimumPercent: null,
  rounding: "HALF_UP",
};
export function positionEligibility(
  scheme: Scheme,
  marks: Record<string, Mark>,
) {
  return scheme.papers.every(
    (p) =>
      marks[p.code]?.state === "GRADED" &&
      marks[p.code]?.onTime === true &&
      marks[p.code]?.onLeave !== true,
  );
}
export * from "./calendar";
