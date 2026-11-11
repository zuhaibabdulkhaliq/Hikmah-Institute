import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/server.ts";
import { pool } from "../apps/api/src/db.ts";
const id = (key: string) => {
  const h = createHash("sha256")
    .update("hikmah-demo:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const app = await buildApp();
after(async () => {
  await app.close();
  await pool.end();
});
let loginClient = 1;
async function login(role: string) {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    remoteAddress: `127.0.1.${loginClient++}`,
    payload: {
      email: `${role}@hikmah.example`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  assert.equal(r.statusCode, 200, r.body);
  return { authorization: `Bearer ${r.json().token}` };
}
test("Milestone A: health, maintained auth, 9 levels, 3 cycles and synthetic seed", async () => {
  assert.equal((await app.inject("/health")).statusCode, 200);
  assert.equal((await app.inject("/v1/me")).statusCode, 401);
  const h = await login("admin");
  const levels = await app.inject({ url: "/v1/levels", headers: h });
  assert.equal(levels.statusCode, 200);
  assert.equal(levels.headers["cache-control"], "private, no-store");
  assert.equal(levels.json().length, 9);
  assert.equal(
    (await app.inject({ url: "/v1/exam-cycles", headers: h })).json().length,
    3,
  );
});
test("R02/R03/R17: Ameer isolation, teacher paper scope and no privilege escalation", async () => {
  const ameer = await login("ameer");
  const sections = await app.inject({ url: "/v1/sections", headers: ameer });
  assert.equal(sections.json().length, 1);
  for (const method of ["GET", "PUT"] as const) {
    const r = await app.inject({
      method,
      url: `/v1/sections/${id("sectionB")}/attendance/2026-11-06`,
      headers: { ...ameer, "if-match": "0" },
      ...(method === "PUT" ? { payload: { records: [] } } : {}),
    });
    assert.equal(r.statusCode, 403, r.body);
  }
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `/v1/users/${id("ameer")}`,
        headers: ameer,
        payload: { active: true, admin: true },
      })
    ).statusCode,
    403,
  );
  const teacher = await login("teacher");
  assert.equal(
    (await app.inject({ url: "/v1/assessments", headers: teacher })).json()
      .length,
    3,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/v1/assessments/${id("P04")}/marks/bulk`,
        headers: teacher,
        payload: {
          entries: [
            {
              enrollmentId: id("enrollment0"),
              state: "GRADED",
              awarded: 0,
              version: 1,
            },
          ],
        },
      })
    ).statusCode,
    403,
  );
});
test("R11: database guards reject cross-section and excess marks", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assert.rejects(
      client.query(
        "INSERT INTO marks(assessment_id,enrollment_id,entry_state,awarded) VALUES($1,$2,'GRADED',34)",
        [id("P01"), id("enrollment5")],
      ),
    );
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
});
test("R12/R21: unapproved policies and attendance prevent publication, preview totals work", async () => {
  const admin = await login("admin");
  const r = await app.inject({
    method: "POST",
    url: `/v1/results/${id("SHASH_MAHI")}/${id("sectionA")}/validate`,
    headers: admin,
    payload: {},
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().canPublish, false);
  assert(r.json().blockingErrors.some((s: string) => s.includes("approval")));
  assert.equal(
    r.json().snapshot.students.find((s: any) => s.studentNumber === "SYN-001")
      .total,
    513,
  );
  const p = await app.inject({
    method: "POST",
    url: `/v1/results/${id("SHASH_MAHI")}/${id("sectionA")}/publish`,
    headers: { ...admin, "idempotency-key": randomUUID() },
    payload: { validationHash: r.json().validationHash },
  });
  assert.equal(p.statusCode, 422, p.body);
});
test("R22: disabled staff immediately loses existing session", async () => {
  const headers = await login("teacher");
  await pool.query("UPDATE app_users SET active=false WHERE id=$1", [
    id("teacher"),
  ]);
  try {
    assert.equal(
      (await app.inject({ url: "/v1/me", headers })).statusCode,
      403,
    );
  } finally {
    await pool.query("UPDATE app_users SET active=true WHERE id=$1", [
      id("teacher"),
    ]);
  }
});
test("Same-day Ameer drafts work while result policies remain unapproved", async () => {
  const headers = await login("ameer"),
    admin = await login("admin");
  const section = id("sectionA");
  const me = (await app.inject({ url: "/v1/me", headers })).json();
  const date = me.today;
  let r = await app.inject({
    method: "PUT",
    url: `/v1/sections/${section}/calendar`,
    headers: admin,
    payload: [
      {
        schoolDate: date,
        isInstructional: true,
        countsForAttendance: true,
        note: "Same-day draft test",
      },
    ],
  });
  assert.equal(r.statusCode, 200, r.body);
  r = await app.inject({
    method: "PUT",
    url: `/v1/sections/${section}/attendance/${date}`,
    headers: { ...headers, "if-match": "0" },
    payload: { records: [] },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(
    (
      await pool.query(
        "SELECT config->'approvedPolicy' AS p FROM organization_settings WHERE organization_id=$1",
        [id("org")],
      )
    ).rows[0].p,
    null,
  );
  await pool.query(
    "DELETE FROM attendance_sheets WHERE section_id=$1 AND school_date=$2",
    [section, date],
  );
});
test("Milestones C–E: complete attendance, stale versions, atomic retries, publication and immutable correction", async () => {
  const h = await login("admin");
  const section = id("sectionA"),
    cycle = id("SHASH_MAHI");
  const call = async (
    method: any,
    url: string,
    payload?: any,
    extra: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url,
      headers: { ...h, ...extra },
      ...(payload === undefined ? {} : { payload }),
    });
  const ok = (r: any, code = 200) => assert.equal(r.statusCode, code, r.body);
  const today = (await pool.query("SELECT CURRENT_DATE::text AS day")).rows[0]
    .day;
  const dayPath = `/v1/sections/${section}/attendance/${today}`;
  const policy = {
    attendance: {
      credits: {
        PRESENT: { earned: 1, possible: 1 },
        ABSENT: { earned: 0, possible: 1 },
        HALF: { earned: 0.5, possible: 1 },
        LEAVE: { earned: 0, possible: 0 },
      },
      zeroDenominator: "BLOCK",
      backdateDays: 5,
      decimals: 1,
    },
    grades: [
      { label: "TEST ONLY Fail", min: 0, max: 40, pass: false },
      { label: "TEST ONLY Pass", min: 40, max: 101, pass: true },
    ],
    eligibility: "ANY_ENROLLED_IN_WINDOW",
    ranking: { tie: "COMPETITION", topN: 3, onlyPassing: true },
    missing: { absent: "BLOCK", exempt: "BLOCK" },
    passMinimumPercent: 40,
    paperMinimumPercent: null,
    rounding: "HALF_UP",
  };
  ok(await call("PUT", "/v1/policies", { policy, approve: true, version: 1 }));
  ok(
    await call("PUT", `/v1/sections/${section}/calendar`, [
      {
        schoolDate: today,
        isInstructional: true,
        countsForAttendance: true,
        note: "Test only",
      },
    ]),
  );
  const roster = (await call("GET", dayPath)).json().roster;
  ok(
    await call(
      "PUT",
      dayPath,
      { records: [{ enrollmentId: roster[0].id, status: "PRESENT" }] },
      { "if-match": "0" },
    ),
  );
  ok(await call("POST", dayPath + "/submit", {}, { "if-match": "1" }), 422);
  ok(await call("PUT", dayPath, { records: [] }, { "if-match": "0" }), 409);
  const ameerHeaders = await login("ameer");
  const records = roster.map((e: any) => ({
    enrollmentId: e.id,
    status: "PRESENT",
  }));
  const previousDate = new Date(Date.parse(today) - 86400000)
    .toISOString()
    .slice(0, 10);
  ok(
    await call("PUT", `/v1/sections/${section}/calendar`, [
      {
        schoolDate: previousDate,
        isInstructional: true,
        countsForAttendance: true,
        note: "Test backdate",
      },
    ]),
  );
  ok(
    await app.inject({
      method: "PUT",
      url: `/v1/sections/${section}/attendance/${previousDate}`,
      headers: { ...ameerHeaders, "if-match": "0" },
      payload: { records },
    }),
  );
  const bulkKey = randomUUID();
  const bulkBody = { days: [{ schoolDate: today, version: 1, records }] };
  const bulkPath = `/v1/sections/${section}/attendance/bulk`;
  ok(await call("POST", bulkPath, bulkBody, { "idempotency-key": bulkKey }));
  ok(await call("POST", bulkPath, bulkBody, { "idempotency-key": bulkKey }));
  assert.equal((await call("GET", dayPath)).json().version, 2);
  ok(
    await call(
      "POST",
      bulkPath,
      {
        days: [
          { schoolDate: today, version: 2, records: [] },
          { schoolDate: "2099-01-01", version: 0, records: [] },
        ],
      },
      { "idempotency-key": randomUUID() },
    ),
    422,
  );
  assert.equal(
    (await call("GET", dayPath)).json().records.length,
    20,
    "Failed bulk must roll back all dates",
  );
  ok(await call("POST", dayPath + "/submit", {}, { "if-match": "2" }));
  ok(
    await call("PUT", `/v1/exam-cycles/${cycle}/sections/${section}/window`, {
      attendanceFrom: today,
      attendanceThrough: today,
      examStart: null,
      examEnd: null,
    }),
  );
  ok(
    await call(
      "POST",
      `/v1/exam-cycles/${cycle}/sections/${section}/scheme/approve`,
      {},
    ),
  );
  const papers = (await call("GET", "/v1/assessments")).json();
  for (const p of papers) {
    const entries = (await call("GET", `/v1/assessments/${p.id}/marks`)).json()
      .entries;
    ok(
      await call("PUT", `/v1/assessments/${p.id}/marks/bulk`, {
        entries: entries.map((e: any) => ({
          enrollmentId: e.enrollmentId,
          state: "GRADED",
          awarded: e.awarded === null ? 0 : Number(e.awarded),
          version: e.version ?? 0,
        })),
      }),
    );
    ok(await call("POST", `/v1/assessments/${p.id}/submit`, {}));
    ok(await call("POST", `/v1/assessments/${p.id}/approve`, {}));
  }
  const validate = async () => {
    const r = await call(
      "POST",
      `/v1/results/${cycle}/${section}/validate`,
      {},
    );
    ok(r);
    return r.json();
  };
  let report = await validate();
  assert.equal(report.canPublish, true, JSON.stringify(report.blockingErrors));
  const publishPath = `/v1/results/${cycle}/${section}/publish`,
    publishKey = randomUUID();
  let r = await call(
    "POST",
    publishPath,
    { validationHash: report.validationHash },
    { "idempotency-key": publishKey },
  );
  ok(r, 201);
  const first = r.json();
  r = await call(
    "POST",
    publishPath,
    { validationHash: report.validationHash },
    { "idempotency-key": publishKey },
  );
  ok(r);
  assert.equal(r.json().id, first.id);
  const pdf = await call("GET", `/v1/results/${first.id}/sectionsheet.pdf`);
  ok(pdf);
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
  const individual = await call(
    "GET",
    `/v1/results/${first.id}/students/${roster[0].id}.pdf`,
  );
  ok(individual);
  assert.equal(individual.rawPayload.subarray(0, 5).toString(), "%PDF-");
  await mkdir(".data/reports", { recursive: true });
  await writeFile(".data/reports/test-class.pdf", pdf.rawPayload);
  await writeFile(".data/reports/test-individual.pdf", individual.rawPayload);
  const pdfText = execFileSync("pdftotext", ["-layout", "-", "-"], {
    input: pdf.rawPayload,
    encoding: "utf8",
  }).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
  assert(
    pdfText.includes("513 / 600"),
    "RTL report must keep the earned / maximum numeric order",
  );
  const stored = (
    await pool.query("SELECT document_snapshot FROM result_runs WHERE id=$1", [
      first.id,
    ])
  ).rows[0].document_snapshot;
  assert.equal(stored.students[0].attendance.displayPercent, "100.0");
  await assert.rejects(
    pool.query(
      "UPDATE result_snapshots SET grade='tamper' WHERE result_run_id=$1",
      [first.id],
    ),
  );
  await assert.rejects(
    pool.query("UPDATE exam_assessments SET max_marks=999 WHERE id=$1", [
      id("P01"),
    ]),
  );
  ok(
    await call("PATCH", `/v1/students/${id("SYN-001")}`, {
      full_name: "Synthetic corrected name",
    }),
  );
  const unchanged = await call(
    "GET",
    `/v1/results/${first.id}/sectionsheet.pdf`,
  );
  assert.deepEqual(unchanged.rawPayload, pdf.rawPayload);
  report = await validate();
  r = await call(
    "POST",
    publishPath,
    {
      validationHash: report.validationHash,
      correctionReason: "Synthetic name correction",
    },
    { "idempotency-key": randomUUID() },
  );
  ok(r, 201);
  assert.equal(r.json().revision, 2);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT document_snapshot FROM result_runs WHERE id=$1",
        [first.id],
      )
    ).rows[0].document_snapshot,
    stored,
  );
  assert.equal(
    (await pool.query("SELECT state FROM result_runs WHERE id=$1", [first.id]))
      .rows[0].state,
    "SUPERSEDED",
  );

  const currentScheme = (
    await call("GET", `/v1/exam-cycles/${cycle}/sections/${section}/scheme`)
  ).json().scheme;
  currentScheme.papers[0].max = 34;
  currentScheme.groups[0].max = 101;
  const revised = await call(
    "POST",
    `/v1/exam-cycles/${cycle}/sections/${section}/scheme/revise`,
    {
      scheme: currentScheme,
      reason: "TEST ONLY reviewed maximum correction",
      copyMarks: true,
    },
  );
  ok(revised);
  assert.equal(revised.json().revision, 2);
  const loaded = (
    await call("GET", `/v1/exam-cycles/${cycle}/sections/${section}/scheme`)
  ).json();
  assert.equal(loaded.scheme.papers.length, 11);
  assert.equal(loaded.scheme.papers[0].max, 34);
  assert.equal(loaded.approval, null);
  assert.deepEqual(
    (await call("GET", `/v1/results/${first.id}/sectionsheet.pdf`)).rawPayload,
    pdf.rawPayload,
  );
});
test("Milestones B/F: validated CSV import, duplicate/formula rejection, invitation activation and rollover", async () => {
  const h = await login("admin");
  const call = async (method: any, url: string, payload?: any) =>
    app.inject({
      method,
      url,
      headers: h,
      ...(payload === undefined ? {} : { payload }),
    });
  const section = id("sectionB");
  let r = await call("POST", `/v1/sections/${section}/import/preview`, {
    csv: "student_number,full_name,roll_number,joined_on\nCSV-1,=HYPERLINK(),21,2026-01-01\nCSV-1,Duplicate,21,2026-01-01",
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().canApply, false);
  r = await call("POST", `/v1/sections/${section}/import/preview`, {
    csv: "student_number,full_name,roll_number,joined_on\nCSV-VALID,مصنوعی طالب علم,21,2026-01-01",
  });
  assert.equal(r.json().canApply, true, r.body);
  const job = r.json().jobId;
  r = await call("POST", `/v1/imports/${job}/apply`, {});
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().count, 1);
  assert.equal(
    (await call("POST", `/v1/imports/${job}/apply`, {})).statusCode,
    409,
  );
  r = await call("POST", "/v1/invitations", {
    name: "Invited synthetic staff",
    email: "invited@example.test",
  });
  assert.equal(r.statusCode, 200, r.body);
  const token = r.json().activationUrl.split("#")[1];
  r = await app.inject({
    method: "POST",
    url: "/v1/invitations/accept",
    payload: { token, password: "synthetic-invitation-passphrase" },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/invitations/accept",
        payload: { token, password: "synthetic-invitation-passphrase" },
      })
    ).statusCode,
    400,
  );
  const signedIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: {
      email: "invited@example.test",
      password: "synthetic-invitation-passphrase",
    },
  });
  assert.equal(signedIn.statusCode, 200, signedIn.body);
  const auth = { authorization: `Bearer ${signedIn.json().token}` };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/invitations",
        headers: auth,
        payload: { name: "Escalation", email: "escalation@example.test" },
      })
    ).statusCode,
    403,
  );
});
test("R06/R19: attendance overlaps require acknowledgment and calendar loads paginate at 100", async () => {
  const h = await login("admin"),
    section = id("sectionB"),
    today = (await pool.query("SELECT CURRENT_DATE::text AS d")).rows[0].d;
  const call = async (method: any, url: string, payload?: any) =>
    app.inject({
      method,
      url,
      headers: h,
      ...(payload === undefined ? {} : { payload }),
    });
  for (const [i, cycle] of ["SEH_MAHI", "MOCK"].entries()) {
    const r = await call(
      "PUT",
      `/v1/exam-cycles/${id(cycle)}/sections/${section}/window`,
      {
        attendanceFrom: today,
        attendanceThrough: today,
        examStart: null,
        examEnd: null,
      },
    );
    assert.equal(r.statusCode, i === 0 ? 200 : 422, r.body);
  }
  const acknowledged = await call(
    "PUT",
    `/v1/exam-cycles/${id("MOCK")}/sections/${section}/window`,
    {
      attendanceFrom: today,
      attendanceThrough: today,
      examStart: null,
      examEnd: null,
      acknowledgeOverlap: true,
    },
  );
  assert.equal(acknowledged.statusCode, 200, acknowledged.body);
  const days = Array.from({ length: 120 }, (_, i) => ({
    schoolDate: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    isInstructional: true,
    countsForAttendance: true,
    note: "Synthetic load check",
  }));
  assert.equal(
    (await call("PUT", `/v1/sections/${section}/calendar`, days)).statusCode,
    200,
  );
  const first = await call("GET", `/v1/sections/${section}/calendar`);
  assert.equal(first.json().length, 100);
  const next = await call("GET", `/v1/sections/${section}/calendar?offset=100`);
  assert.equal(next.json().length, 20);
});
test("Effective assignment expiry removes access without requiring a new login", async () => {
  const h = await login("ameer");
  const saved = (
    await pool.query(
      "SELECT id,starts_on,ends_on FROM section_staff_assignments WHERE user_id=$1",
      [id("ameer")],
    )
  ).rows;
  await pool.query(
    "UPDATE section_staff_assignments SET ends_on=starts_on WHERE user_id=$1",
    [id("ameer")],
  );
  try {
    const r = await app.inject({
      url: `/v1/sections/${id("sectionA")}/enrollments`,
      headers: h,
    });
    assert.equal(r.statusCode, 403, r.body);
  } finally {
    for (const row of saved)
      await pool.query(
        "UPDATE section_staff_assignments SET ends_on=$2 WHERE id=$1",
        [row.id, row.ends_on],
      );
  }
});
test("R01/R02/R11/R17: editable academic structure, three papers across two sections and administrator grants", async () => {
  const h = await login("admin");
  const call = async (method: any, url: string, payload?: any, headers = h) =>
    app.inject({
      method,
      url,
      headers,
      ...(payload === undefined ? {} : { payload }),
    });
  const year = await call("POST", "/v1/academic-years", {
    label: "Test next year",
    start_date: "2028-01-01",
    end_date: "2028-12-31",
    state: "PLANNED",
  });
  assert.equal(year.statusCode, 201, year.body);
  const yearCycles = (await call("GET", "/v1/exam-cycles"))
    .json()
    .filter((c: any) => c.academic_year_id === year.json().id);
  assert.equal(yearCycles.length, 3);
  for (let n = 1; n <= 9; n++) {
    const r = await call("PATCH", `/v1/levels/${id("level" + n)}`, {
      name_en: `Configured test level ${n}`,
    });
    assert.equal(r.statusCode, 200, r.body);
  }
  for (const code of ["A", "B"]) {
    const r = await call("POST", "/v1/sections", {
      academic_year_id: year.json().id,
      program_id: id("program"),
      level_id: id("level3"),
      code,
      name: `Test section ${code}`,
    });
    assert.equal(r.statusCode, 201, r.body);
  }
  const section = id("sectionB"),
    cycle = id("SHASH_MAHI");
  const offering = await call("POST", `/v1/sections/${section}/subjects`, {
    subject_id: id("subjectP04"),
  });
  assert.equal(offering.statusCode, 200, offering.body);
  const assigned = await call(
    "POST",
    `/v1/offerings/${offering.json().id}/teachers`,
    { teacher_user_id: id("teacher"), starts_on: "2026-01-01" },
  );
  assert.equal(assigned.statusCode, 200, assigned.body);
  const oldAssignment = (
    await pool.query(
      "SELECT id FROM subject_teacher_assignments WHERE section_subject_id=$1 AND teacher_user_id=$2",
      [id("offeringP03"), id("teacher")],
    )
  ).rows[0];
  const expired = await call("PATCH", `/v1/teaching/${oldAssignment.id}`, {
    endsOn: "2026-01-01",
    reason: "Synthetic reassignment",
  });
  assert.equal(expired.statusCode, 200, expired.body);
  const scheme = {
    papers: Array.from({ length: 6 }, (_, i) => ({
      offeringId: offering.json().id,
      code: "B04_" + i,
      label: "Test paper B " + i,
      max: 11,
      type: "WRITTEN",
      pattern: "",
      date: null,
    })),
    groups: Array.from({ length: 6 }, (_, i) => ({
      name: "Test group B " + i,
      max: 11,
      paperCodes: ["B04_" + i],
    })),
  };
  let r = await call(
    "PUT",
    `/v1/exam-cycles/${cycle}/sections/${section}/scheme`,
    scheme,
  );
  assert.equal(r.statusCode, 200, r.body);
  r = await call(
    "POST",
    `/v1/exam-cycles/${cycle}/sections/${section}/scheme/approve`,
    {},
  );
  assert.equal(r.statusCode, 200, r.body);
  const teacher = await login("teacher");
  const visible = (
    await call("GET", "/v1/assessments", undefined, teacher)
  ).json();
  assert.equal(visible.length, 8);
  assert.equal(new Set(visible.map((p: any) => p.section_id)).size, 2);
  const paper = visible.find((p: any) => p.section_id === section);
  r = await call(
    "PUT",
    `/v1/assessments/${paper.id}/marks/bulk`,
    {
      entries: [
        {
          enrollmentId: id("enrollment0"),
          state: "GRADED",
          awarded: 0,
          version: 0,
        },
      ],
    },
    teacher,
  );
  assert.equal(r.statusCode, 422, r.body);
  r = await call("PATCH", `/v1/users/${id("teacher")}`, {
    active: true,
    admin: true,
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(
    (await call("GET", "/v1/me", undefined, teacher)).statusCode,
    401,
  );
  const promoted = await login("teacher");
  assert(
    (await call("GET", "/v1/me", undefined, promoted))
      .json()
      .roles.includes("ADMIN"),
  );
  r = await call("PATCH", `/v1/users/${id("teacher")}`, {
    active: true,
    admin: false,
  });
  assert.equal(r.statusCode, 200, r.body);
});
test("Single-use password recovery invalidates old password and every session", async () => {
  const admin = await login("admin"),
    old = await login("teacher");
  const issued = await app.inject({
    method: "POST",
    url: `/v1/users/${id("teacher")}/reset-password`,
    headers: admin,
    payload: { reason: "Synthetic forgotten password verification" },
  });
  assert.equal(issued.statusCode, 200, issued.body);
  const token = issued.json().activationUrl.split("#")[1],
    password = "synthetic-recovered-passphrase";
  const accepted = await app.inject({
    method: "POST",
    url: "/v1/invitations/accept",
    payload: { token, password },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  assert.equal(
    (await app.inject({ url: "/v1/me", headers: old })).statusCode,
    401,
  );
  const reused = await app.inject({
    method: "POST",
    url: "/v1/invitations/accept",
    payload: { token, password },
  });
  assert.equal(reused.statusCode, 400, reused.body);
  const oldLogin = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: {
      email: "teacher@hikmah.example",
      password: process.env.DEMO_PASSWORD,
    },
  });
  assert.equal(oldLogin.statusCode, 401, oldLogin.body);
  const newLogin = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: "teacher@hikmah.example", password },
  });
  assert.equal(newLogin.statusCode, 200, newLogin.body);
});
test("Generated OpenAPI includes registered routes and shared request schemas", async () => {
  const headers = await login("admin");
  const response = await app.inject({ url: "/v1/openapi.json", headers });
  assert.equal(response.statusCode, 200, response.body);
  const doc = response.json();
  assert.equal(doc.openapi, "3.1.0");
  for (const path of [
    "/v1/me",
    "/v1/sections/{id}/attendance/{date}",
    "/v1/assessments/{id}/marks/bulk",
    "/v1/results/{cycle}/{section}/publish",
    "/v1/exam-cycles/{cycle}/sections/{section}/scheme/revise",
  ])
    assert(doc.paths[path], path);
  assert(
    doc.components.schemas.ApprovedPolicy.required.includes("eligibility"),
  );
  assert(
    doc.paths["/v1/assessments/{id}/marks/bulk"].put.requestBody.content[
      "application/json"
    ].schema.properties.entries,
  );
});
test("Paper CSV import distinguishes numeric zero, blank status and formula injection", async () => {
  const headers = await login("admin");
  const visible = (
    await app.inject({ url: "/v1/assessments", headers })
  ).json();
  const paper = visible.find((p: any) => p.paper_code === "P01");
  const url = `/v1/assessments/${paper.id}/marks/import/preview`;
  const response = await app.inject({
    method: "POST",
    url,
    headers,
    payload: {
      csv: "student_number,P01\nSYN-001,0\nSYN-002,",
      reason: "Synthetic legacy import review",
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().entries[0].state, "GRADED");
  assert.equal(response.json().entries[0].awarded, 0);
  assert.equal(response.json().entries[1].state, "UNKNOWN_LEGACY_BLANK");
  assert.equal(response.json().entries[1].awarded, null);
  const invalid = await app.inject({
    method: "POST",
    url,
    headers,
    payload: {
      csv: "student_number,P01\nSYN-001,=1+2",
      reason: "Synthetic invalid import review",
    },
  });
  assert.equal(invalid.json().canApply, false);
});
test("R05: late join, withdrawal boundaries and noninstructional days preserve roster eligibility", async () => {
  const headers = await login("admin"),
    section = id("sectionB");
  let r = await app.inject({
    method: "POST",
    url: "/v1/students",
    headers,
    payload: {
      student_number: "EDGE-ENROLLMENT",
      full_name: "Synthetic date boundary learner",
    },
  });
  assert.equal(r.statusCode, 201, r.body);
  const student = r.json().id;
  r = await app.inject({
    method: "POST",
    url: `/v1/sections/${section}/enrollments`,
    headers,
    payload: {
      student_id: student,
      roll_number: "EDGE",
      joined_on: "2026-01-03",
      left_on: "2026-01-05",
    },
  });
  assert.equal(r.statusCode, 200, r.body);
  const enrollment = r.json().id;
  for (const [date, expected] of [
    ["2026-01-02", false],
    ["2026-01-03", true],
    ["2026-01-05", true],
    ["2026-01-06", false],
  ] as const) {
    const sheet = await app.inject({
      url: `/v1/sections/${section}/attendance/${date}`,
      headers,
    });
    assert.equal(sheet.statusCode, 200, sheet.body);
    assert.equal(
      sheet.json().roster.some((e: any) => e.id === enrollment),
      expected,
    );
  }
  r = await app.inject({
    method: "PUT",
    url: `/v1/sections/${section}/calendar`,
    headers,
    payload: [
      {
        schoolDate: "2026-01-04",
        isInstructional: false,
        countsForAttendance: false,
        note: "Synthetic holiday",
      },
    ],
  });
  assert.equal(r.statusCode, 200, r.body);
  r = await app.inject({
    method: "PUT",
    url: `/v1/sections/${section}/attendance/2026-01-04`,
    headers: { ...headers, "if-match": "0" },
    payload: { records: [{ enrollmentId: enrollment, status: "PRESENT" }] },
  });
  assert.equal(r.statusCode, 422, r.body);
});
test("Unused student imports roll back atomically and rollover preserves historical enrollment", async () => {
  const headers = await login("admin"),
    section = id("sectionB");
  const call = async (method: any, url: string, payload?: any) =>
    app.inject({
      method,
      url,
      headers,
      ...(payload === undefined ? {} : { payload }),
    });
  let r = await call("POST", `/v1/sections/${section}/import/preview`, {
    csv: "student_number,full_name,roll_number,joined_on\nROLLBACK-ONLY,Synthetic unused import,RB,2026-01-01",
  });
  assert.equal(r.json().canApply, true, r.body);
  const job = r.json().jobId;
  r = await call("POST", `/v1/imports/${job}/apply`, {});
  assert.equal(r.statusCode, 200, r.body);
  r = await call("POST", `/v1/imports/${job}/rollback`, {
    reason: "Synthetic unused import rollback",
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(
    (
      await pool.query(
        "SELECT 1 FROM students WHERE student_number='ROLLBACK-ONLY'",
      )
    ).rowCount,
    0,
  );
  const year = (await call("GET", "/v1/academic-years"))
    .json()
    .find((y: any) => y.label === "Test next year");
  const target = (await call("GET", "/v1/sections"))
    .json()
    .find((s: any) => s.academic_year_id === year.id && s.code === "A");
  const source = (await call("GET", `/v1/sections/${section}/enrollments`))
    .json()
    .find((e: any) => e.student_number === "CSV-VALID");
  r = await call("POST", `/v1/sections/${section}/rollover`, {
    targetSection: target.id,
    joinedOn: "2028-01-01",
    enrollmentIds: [source.id],
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().enrollmentIds.length, 1);
  assert(
    (await call("GET", `/v1/sections/${section}/enrollments`))
      .json()
      .some((e: any) => e.id === source.id),
  );
});
test("R19: 100 consecutive persisted attendance sheets load full 100-person rosters", async () => {
  const headers = await login("admin");
  const section = (
    await pool.query(
      "INSERT INTO sections(organization_id,academic_year_id,program_id,level_id,code,name) VALUES($1,$2,$3,$4,'PERF','Synthetic load section') RETURNING id",
      [id("org"), id("year"), id("program"), id("level3")],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO students(organization_id,student_number,full_name) SELECT $1,'PERF-'||n,'Synthetic load learner '||n FROM generate_series(1,100) n",
    [id("org")],
  );
  await pool.query(
    "INSERT INTO enrollments(student_id,section_id,roll_number,joined_on) SELECT id,$1,student_number,'2026-01-01' FROM students WHERE student_number LIKE 'PERF-%'",
    [section],
  );
  await pool.query(
    "INSERT INTO section_calendar_days(section_id,school_date) SELECT $1,'2026-01-01'::date+n FROM generate_series(0,99) n",
    [section],
  );
  await pool.query(
    "INSERT INTO attendance_sheets(section_id,school_date,state,created_by,submitted_by,submitted_at) SELECT section_id,school_date,'SUBMITTED',$2,$2,now() FROM section_calendar_days WHERE section_id=$1",
    [section, id("admin")],
  );
  await pool.query(
    "INSERT INTO attendance_records(sheet_id,enrollment_id,status,marked_by) SELECT s.id,e.id,'PRESENT',$2 FROM attendance_sheets s JOIN enrollments e ON e.section_id=s.section_id WHERE s.section_id=$1",
    [section, id("admin")],
  );
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
    const r = await app.inject({
      url: `/v1/sections/${section}/attendance/${date}`,
      headers,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().roster.length, 100);
    assert.equal(r.json().records.length, 100);
  }
  console.log(
    `R19 observation: 100 persisted sheets / 10,000 records loaded in ${Math.round(performance.now() - start)} ms (local serial requests; not a concurrent production SLA).`,
  );
});
test("Authentication route rate limit rejects repeated requests from one client", async () => {
  let response;
  for (let i = 0; i < 21; i++)
    response = await app.inject({
      url: "/api/auth/get-session",
      remoteAddress: "127.0.2.250",
    });
  assert.equal(response!.statusCode, 429, response!.body);
});
test("Student CSV preview maps source columns without changing validation rules", async () => {
  const headers = await login("admin");
  const r = await app.inject({
    method: "POST",
    url: `/v1/sections/${id("sectionB")}/import/preview`,
    headers,
    payload: {
      csv: "Registration,Name,Class roll,Joining\nMAPPED-ONE,مصنوعی طالب علم,MAP-1,2026-01-01",
      columnMapping: {
        student_number: "Registration",
        full_name: "Name",
        roll_number: "Class roll",
        joined_on: "Joining",
      },
    },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().canApply, true, r.body);
  assert.equal(r.json().rows[0].student_number, "MAPPED-ONE");
});
