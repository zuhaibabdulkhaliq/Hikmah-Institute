import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculate,
  schemeSchema,
  markInput,
  policySchema,
  attendancePercent,
  rank,
  csvCell,
  type Scheme,
} from "../packages/domain/src/index.ts";
const fixture = JSON.parse(
  readFileSync(
    "Hikmah_Final_Blueprint/examples/shash_mahi_1448_level3_evening_scheme.json",
    "utf8",
  ),
);
export const scheme: Scheme = {
  papers: fixture.papers.map((p: any) => ({
    code: p.code,
    label: p.label_ur,
    max: p.max_marks,
    offeringId: "00000000-0000-4000-a000-000000000001",
    type: p.type,
    pattern: "",
    date: null,
  })),
  groups: fixture.result_groups.map((g: any) => ({
    name: g.code,
    max: g.max_marks,
    paperCodes: g.paper_codes,
  })),
};
export const policy = policySchema.parse({
  attendance: {
    credits: {
      PRESENT: { earned: 1, possible: 1 },
      ABSENT: { earned: 0, possible: 1 },
      HALF: { earned: 0.5, possible: 1 },
      LEAVE: { earned: 0, possible: 0 },
    },
    zeroDenominator: "BLOCK",
    backdateDays: 3,
    decimals: 1,
  },
  grades: [
    { label: "Test fail", min: 0, max: 50, pass: false },
    { label: "Test pass", min: 50, max: 101, pass: true },
  ],
  eligibility: "ANY_ENROLLED_IN_WINDOW",
  ranking: { tie: "COMPETITION", topN: null, onlyPassing: false },
  missing: { absent: "BLOCK", exempt: "BLOCK" },
  passMinimumPercent: 50,
  paperMinimumPercent: null,
  rounding: "HALF_UP",
});
test("R07/R08: exact 11-paper fixtures, six 100 groups, duplicate Tafsir labels", () => {
  schemeSchema.parse(scheme);
  assert.equal(scheme.papers.filter((p) => p.label === "تفسیر").length, 2);
  const expected = JSON.parse(
    readFileSync(
      "Hikmah_Final_Blueprint/examples/synthetic_results_expected.json",
      "utf8",
    ),
  );
  for (const student of expected.students) {
    const result = calculate(
      scheme,
      Object.fromEntries(
        scheme.papers.map((p, i) => [
          p.code,
          { state: "GRADED", awarded: student.marks_rtl[i] },
        ]),
      ),
    );
    assert.equal(result.total, student.total);
    assert.equal(result.percent, String(student.percent));
    assert.deepEqual(
      result.groups.map((g) => g.awarded),
      student.group_totals,
    );
    assert.equal(result.grade, null);
  }
});
test("R09/R10: explicit zero distinct from every unresolved status", () => {
  markInput.parse({
    enrollmentId: scheme.papers[0].offeringId,
    state: "GRADED",
    awarded: 0,
    version: 0,
  });
  assert.throws(() =>
    markInput.parse({
      enrollmentId: scheme.papers[0].offeringId,
      state: "PENDING",
      awarded: 0,
      version: 0,
    }),
  );
  for (const state of [
    "PENDING",
    "WITHHELD",
    "UNKNOWN_LEGACY_BLANK",
    "ABSENT",
    "EXEMPT",
  ] as const) {
    const result = calculate(scheme, { P01: { state, awarded: null } }, policy);
    assert(result.errors.includes(`P01: ${state}`));
  }
});
test("R11: negative and overprecision marks rejected", () => {
  for (const awarded of [-1, 1.001])
    assert.throws(() =>
      markInput.parse({
        enrollmentId: scheme.papers[0].offeringId,
        state: "GRADED",
        awarded,
        version: 0,
      }),
    );
});
test("policy requires complete credits and contiguous grades, never inferred thresholds", () => {
  assert.throws(() => policySchema.parse({}));
  assert.throws(() =>
    policySchema.parse({
      ...policy,
      grades: [{ label: "broken", min: 40, max: 101, pass: true }],
    }),
  );
  assert.equal(calculate(scheme, {}).grade, null);
});
test("R05: attendance credit policy and zero denominator", () => {
  assert.equal(
    attendancePercent(["PRESENT", "HALF", "ABSENT", "LEAVE"], policy.attendance)
      .percent,
    "50",
  );
  assert.equal(attendancePercent(["LEAVE"], policy.attendance).percent, null);
});
test("R14: competition and dense tie policies and topN", () => {
  const rows = [
    { percent: "90", passing: true, onTimeEligible: true },
    { percent: "90", passing: true, onTimeEligible: true },
    { percent: "85", passing: true, onTimeEligible: true },
  ];
  assert.deepEqual(
    rank(rows, policy.ranking).map((r) => r.rank),
    [1, 1, 3],
  );
  assert.deepEqual(
    rank(rows, { ...policy.ranking, tie: "DENSE", topN: 1 }).map((r) => r.rank),
    [1, 1, null],
  );
});
test("R18: CSV formula escaping, quotes and Urdu preserved", () => {
  assert.equal(csvCell("=1+2"), '"\'=1+2"');
  assert.equal(csvCell("حکمت"), '"حکمت"');
  assert.equal(csvCell('a"b'), '"a""b"');
});
test("Approved absence-as-zero also obeys per-paper pass requirements", () => {
  const marks = Object.fromEntries(
    scheme.papers.map((p) => [
      p.code,
      { state: "GRADED" as const, awarded: p.max },
    ]),
  );
  const scores = { ...marks, P01: { state: "ABSENT" as const, awarded: null } };
  const approved = {
    ...policy,
    paperMinimumPercent: 50,
    missing: { ...policy.missing, absent: "ZERO" as const },
  };
  const result = calculate(scheme, scores, approved);
  assert.equal(result.errors.length, 0);
  assert(Number(result.percent) > 90);
  assert.equal(result.passing, false);
  const unresolved = calculate(
    scheme,
    { ...marks, P01: { state: "PENDING", awarded: null } },
    policy,
  );
  assert.equal(unresolved.passing, false);
});

test("Institute rules: 40% overall pass, strict >80% positions, timely completion and shared top three", async () => {
  const { institutePolicy, positionEligibility } =
    await import("../packages/domain/src/index.ts");
  const marks = Object.fromEntries(
    scheme.papers.map((p) => [
      p.code,
      {
        state: "GRADED" as const,
        awarded: Number((p.max * 0.4).toFixed(2)),
        onTime: true,
        onLeave: false,
      },
    ]),
  );
  assert.equal(calculate(scheme, marks, institutePolicy).passing, true);
  assert.equal(positionEligibility(scheme, marks), true);
  assert.equal(
    positionEligibility(scheme, {
      ...marks,
      P01: { ...marks.P01, onTime: false },
    }),
    false,
  );
  assert.equal(
    positionEligibility(scheme, {
      ...marks,
      P01: { ...marks.P01, onTime: null },
    }),
    false,
  );
  assert.equal(
    positionEligibility(scheme, {
      ...marks,
      P01: { ...marks.P01, onLeave: true },
    }),
    false,
  );
  const rows = [
    { percent: "100", passing: true, onTimeEligible: false },
    { percent: "90", passing: true, onTimeEligible: true },
    { percent: "90", passing: true, onTimeEligible: true },
    { percent: "89", passing: true, onTimeEligible: true },
    { percent: "88", passing: true, onTimeEligible: true },
    { percent: "80", passing: true, onTimeEligible: true },
  ];
  assert.deepEqual(
    rank(rows, institutePolicy.ranking).map((r) => r.rank),
    [null, 1, 1, 3, null, null],
  );
  assert.equal(
    rank(
      [{ percent: "80.001", passing: true, onTimeEligible: true }],
      institutePolicy.ranking,
    )[0].rank,
    1,
  );
  assert.throws(() =>
    markInput.parse({
      enrollmentId: scheme.papers[0].offeringId,
      state: "GRADED",
      awarded: 10,
      version: 0,
      onLeave: true,
      onTime: true,
    }),
  );
});
test("Exactly six class groups and the confirmed Half/Leave formula", async () => {
  const { instituteAttendance, classLevelNames } =
    await import("../packages/domain/src/index.ts");
  assert.throws(() =>
    schemeSchema.parse({ ...scheme, groups: scheme.groups.slice(1) }),
  );
  assert.equal(
    attendancePercent(
      ["PRESENT", "HALF", "ABSENT", "LEAVE"],
      instituteAttendance,
    ).percent,
    "50",
  );
  assert.equal(attendancePercent(["LEAVE"], instituteAttendance).percent, null);
  assert.equal(classLevelNames.length, 9);
  assert.equal(classLevelNames[0], "پریپ اولیٰ");
  assert.equal(classLevelNames[8], "دورہ حدیث شریف");
});
