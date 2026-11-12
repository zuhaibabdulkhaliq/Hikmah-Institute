import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { buildApp } from "../apps/api/src/server.ts";
import { pool } from "../apps/api/src/db.ts";
import { renderResultPDF } from "../apps/api/src/results.ts";
import { institutePolicy, sheetCSV } from "../packages/domain/src/index.ts";
const app = await buildApp();
after(async () => {
  await app.close();
  await pool.end();
});
let ip = 1;
async function login(role: string) {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    remoteAddress: `127.7.0.${ip++}`,
    payload: {
      email: `${role}@hikmah.example`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  assert.equal(r.statusCode, 200, r.body);
  return { authorization: `Bearer ${r.json().token}` };
}
const admin = await login("admin"),
  admin2 = await login("admin2"),
  mushrif = await login("mushrif"),
  subject = await login("subject"),
  ameer = await login("ameer");
const ok = (r: any, code = 200) => {
  assert.equal(r.statusCode, code, r.body);
  return r.json();
};
let requestNumber = 1;
async function call(
  method: any,
  url: string,
  payload?: any,
  headers: any = admin,
) {
  return app.inject({
    method,
    url,
    remoteAddress: `127.8.0.${(requestNumber++ % 200) + 1}`,
    headers,
    ...(payload === undefined ? {} : { payload }),
  });
}
const today = ok(await call("GET", "/v1/me")).today as string;
const day = (n: number) =>
  new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
const example = JSON.parse(
  await readFile(
    "Hikmah_Final_Blueprint/examples/shash_mahi_1448_level3_evening_scheme.json",
    "utf8",
  ),
);
const catalog: { id: string }[] = [];
for (const p of example.papers)
  catalog.push(
    ok(
      await call("POST", "/v1/subjects", {
        code: `IMP-${randomUUID()}`,
        name_en: p.label_ur,
        name_ur: p.label_ur,
      }),
      201,
    ),
  );
async function fixture(count = 2, approve = true) {
  const year = ok(
    await call("POST", "/v1/academic-years", {
      label: `Import ${randomUUID()}`,
      hijri_label: "1448 synthetic",
      start_date: day(-365),
      end_date: day(120),
      state: "ACTIVE",
    }),
    201,
  );
  const programs = ok(await call("GET", "/v1/programs")),
    levels = ok(await call("GET", "/v1/levels"));
  const section = ok(
    await call("POST", "/v1/sections", {
      academic_year_id: year.id,
      program_id: programs.find((p: any) => p.code === "EVENING").id,
      level_id: levels.find((l: any) => l.ordinal === 4).id,
      code: "IMP",
      name: "Synthetic import class",
    }),
    201,
  );
  const cycle = ok(await call("GET", "/v1/exam-cycles")).find(
    (c: any) => c.academic_year_id === year.id && c.code === "SHASH_MAHI",
  );
  const base = `/v1/exam-cycles/${cycle.id}/sections/${section.id}`;
  const offerings: { id: string }[] = [];
  for (const subject of catalog)
    offerings.push(
      ok(
        await call("POST", `/v1/sections/${section.id}/subjects`, {
          subject_id: subject.id,
        }),
      ),
    );
  const scheme = {
    papers: example.papers.map((p: any, i: number) => ({
      code: p.code,
      label: p.label_ur,
      max: p.max_marks,
      offeringId: offerings[i].id,
      type: "WRITTEN",
      date: null,
      pattern: "",
    })),
    groups: example.result_groups.map((g: any) => ({
      name: g.label_ur ?? g.code,
      max: g.max_marks,
      paperCodes: g.paper_codes,
    })),
  };
  // The blueprint names grouped maxima and component arrays explicitly.
  for (const [i, g] of scheme.groups.entries()) {
    g.name =
      example.result_groups[i].name_ur ??
      example.result_groups[i].label_ur ??
      example.result_groups[i].group_code ??
      `Group ${i + 1}`;
    g.max = example.result_groups[i].max_marks ?? example.result_groups[i].max;
    g.paperCodes =
      example.result_groups[i].paper_codes ?? example.result_groups[i].papers;
  }
  ok(await call("PUT", base + "/scheme", scheme));
  if (approve) ok(await call("POST", base + "/scheme/approve", {}));
  const students = [];
  for (let i = 0; i < count; i++) {
    const student = ok(
      await call("POST", "/v1/students", {
        student_number: `IM-${randomUUID()}`,
        full_name: `Synthetic import learner ${i + 1}`,
        full_name_ur: `مصنوعی طالب علم ${i + 1}`,
      }),
      201,
    );
    const enrollment = ok(
      await call("POST", `/v1/sections/${section.id}/enrollments`, {
        student_id: student.id,
        roll_number: String(i + 1),
        joined_on: day(-365),
      }),
    );
    students.push({ student, enrollment });
  }
  const papers = ok(await call("GET", base + "/scheme")).scheme.papers;
  return { year, section, cycle, base, students, papers, scheme };
}
type F = Awaited<ReturnType<typeof fixture>>;
async function template(f: F, timing = false, headers = admin) {
  const r = await call(
    "GET",
    f.base + `/marks/template.csv?timing=${timing ? "include" : "preserve"}`,
    undefined,
    headers,
  );
  assert.equal(r.statusCode, 200, r.body);
  return parse(r.body, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
}
async function preview(f: F, rows: string[][], headers = admin) {
  return ok(
    await call(
      "POST",
      f.base + "/marks/import/preview",
      { csv: sheetCSV(rows), reason: "Reviewed synthetic CSV marks upload" },
      headers,
    ),
  );
}
async function apply(batch: any, ack = false, headers = admin) {
  return call(
    "POST",
    `/v1/session-mark-imports/${batch.batchId}/apply`,
    { acknowledgeOverwrite: ack },
    headers,
  );
}
async function stored(f: F, paper = 0, student = 0) {
  return (
    await pool.query(
      "SELECT * FROM marks WHERE assessment_id=$1 AND enrollment_id=$2",
      [f.papers[paper].id, f.students[student].enrollment.id],
    )
  ).rows[0];
}
test("Session CSV template pre-fills the roster, preserves distinct paper codes and imports zero/Urdu digits atomically", async () => {
  const f = await fixture(10),
    rows = await template(f);
  assert.equal(rows[0][0], "HIKMAH_MARKS_TEMPLATE");
  assert.equal(rows.length, 17);
  assert.deepEqual(
    rows.slice(7).map((row) => row[1]),
    Array.from({ length: 10 }, (_, i) => String(i + 1)),
  );
  assert.equal(new Set(rows[6]).size, rows[6].length);
  assert(rows[6][4].includes("P01 / 33"));
  assert(rows[6][5].includes("P02 / 33"));
  for (const r of rows.slice(7)) {
    assert(r[0] && r[1] && r[2] && r[3]);
    assert(r.slice(4, 15).every((v) => v === ""));
    assert(r.slice(15).every((v) => v === "AUTO"));
  }
  rows[7][4] = "0";
  rows[7][5] = "۳۱٫۵";
  rows[8][6] = "ABSENT";
  const p = await preview(f, rows);
  assert(p.canApply);
  assert.equal(p.summary.changedCells, 3);
  assert.equal(p.summary.overwrites, 0);
  ok(await apply(p));
  assert.equal((await stored(f)).awarded, "0.00");
  assert.equal((await stored(f, 1)).awarded, "31.50");
  assert.equal((await stored(f)).on_time, null);
  assert.equal((await stored(f, 2, 1)).entry_state, "ABSENT");
  const version = (await stored(f)).version;
  const replay = ok(await apply(p));
  assert(replay.replayed);
  assert.equal((await stored(f)).version, version);
  const fresh = await template(f);
  fresh[8][7] = "20";
  const p2 = await preview(f, fresh);
  assert(p2.canApply);
  ok(await apply(p2));
  assert.equal((await stored(f)).awarded, "0.00");
});
test("Session CSV validation rejects malformed headers, formulas, invalid scores, duplicate/missing/foreign students and changed protected cells", async () => {
  const f = await fixture();
  for (const input of [
    "=1+2",
    "-1",
    "34",
    "1.234",
    "NaN",
    "1e2",
    "+1",
    "@SUM()",
  ]) {
    const rows = await template(f);
    rows[7][4] = input;
    const p = await preview(f, rows);
    assert(!p.canApply, input);
    assert(p.errors.some((e: any) => e.column === "P01"));
    ok(await apply(p), 422);
  }
  for (const mode of [
    "duplicate",
    "missing",
    "foreign",
    "name",
    "attendance",
  ]) {
    const rows = await template(f);
    rows[7][4] = "10";
    if (mode === "duplicate") rows.push([...rows[7]]);
    if (mode === "missing") rows.pop();
    if (mode === "foreign") rows[7][0] = "FOREIGN-NUMBER";
    if (mode === "name") rows[7][2] = "Changed student name";
    if (mode === "attendance") rows[7][3] = "100";
    const p = await preview(f, rows);
    assert(!p.canApply, mode);
  }
  const rows = await template(f);
  rows[6][5] = rows[6][4];
  ok(
    await call("POST", f.base + "/marks/import/preview", {
      csv: sheetCSV(rows),
      reason: "Invalid duplicate header test",
    }),
    422,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM marks WHERE assessment_id=ANY($1::uuid[])",
        [f.papers.map((p: any) => p.id)],
      )
    ).rows[0].n,
    0,
  );
  const semicolon = await template(f);
  semicolon[7][4] = "10";
  const csv =
    "\uFEFF" +
    semicolon
      .map((r) => r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(";"))
      .join("\r\n");
  assert(
    ok(
      await call("POST", f.base + "/marks/import/preview", {
        csv,
        reason: "Semicolon spreadsheet upload",
      }),
    ).canApply,
  );
  const escaped = await fixture(2, false);
  escaped.scheme.papers[0].label = "=1+1";
  ok(await call("PUT", escaped.base + "/scheme", escaped.scheme));
  ok(await call("POST", escaped.base + "/scheme/approve", {}));
  ok(
    await call("PATCH", `/v1/students/${escaped.students[0].student.id}`, {
      full_name_ur: "=HYPERLINK()",
    }),
  );
  const protectedFile = await template(escaped);
  assert(protectedFile[6][4].startsWith("'="));
  assert(protectedFile[7][2].startsWith("'="));
  protectedFile[7][4] = "10";
  assert((await preview(escaped, protectedFile)).canApply);
});
test("Session CSV scope binds templates to class/session and preview ownership; revoked staff, Ameer and subject-only access are denied", async () => {
  const f = await fixture(),
    other = await fixture();
  const me = ok(await call("GET", "/v1/me", undefined, mushrif));
  const assignment = ok(
    await call("POST", `/v1/sections/${f.section.id}/staff`, {
      user_id: me.userId,
      role: "MUSHRIF",
      starts_on: day(-1),
    }),
  );
  for (const h of [ameer, subject]) {
    ok(await call("GET", f.base + "/marks/template.csv", undefined, h), 403);
    ok(await call("GET", f.base + "/result-sheet", undefined, h), 403);
    ok(
      await call(
        "POST",
        f.base + "/marks/import/preview",
        { csv: "x", reason: "Unauthorized CSV import" },
        h,
      ),
      403,
    );
  }
  const rows = await template(f);
  rows[7][4] = "20";
  ok(
    await call("POST", other.base + "/marks/import/preview", {
      csv: sheetCSV(rows),
      reason: "Wrong class CSV import",
    }),
    422,
  );
  const otherCycle = ok(await call("GET", "/v1/exam-cycles")).find(
    (c: any) => c.academic_year_id === f.year.id && c.id !== f.cycle.id,
  );
  ok(
    await call(
      "POST",
      `/v1/exam-cycles/${otherCycle.id}/sections/${f.section.id}/marks/import/preview`,
      { csv: sheetCSV(rows), reason: "Wrong exam session upload" },
    ),
    422,
  );
  const p = await preview(f, rows);
  ok(await apply(p, false, admin2), 404);
  const own = await preview(f, rows, mushrif);
  assert(own.canApply);
  ok(
    await call("PATCH", `/v1/staff/${assignment.id}`, {
      active: false,
      endsOn: null,
      reason: "Revoke synthetic import authority",
    }),
  );
  ok(await apply(own, false, mushrif), 403);
  assert.equal(await stored(f), undefined);
});
test("Session CSV preserves leave/timing, supports explicit flags, and never assumes new marks were on time", async () => {
  const f = await fixture(3),
    rows = await template(f, true),
    flags = 4 + f.papers.length + 4;
  rows[7][4] = "20";
  rows[7][flags] = "YES";
  rows[7][flags + 1] = "NO";
  rows[8][5] = "30";
  rows[8][flags + 3] = "YES";
  rows[9][6] = "LEAVE";
  const p = await preview(f, rows);
  assert(p.canApply);
  ok(await apply(p));
  assert.equal((await stored(f)).on_leave, true);
  assert.equal((await stored(f)).on_time, false);
  assert.equal((await stored(f, 1, 1)).on_time, true);
  assert.equal((await stored(f, 2, 2)).on_leave, true);
  assert.equal((await stored(f, 2, 2)).entry_state, "PENDING");
  const bad = await template(f, true);
  bad[7][5] = "25";
  bad[7][flags + 2] = "YES";
  bad[7][flags + 3] = "YES";
  assert(!(await preview(f, bad)).canApply);
  const concession = await template(f);
  concession[9][6] = "22";
  const p2 = await preview(f, concession);
  assert(p2.canApply);
  ok(await apply(p2, true));
  assert.equal((await stored(f, 2, 2)).on_leave, true);
  assert.equal((await stored(f, 2, 2)).on_time, false);
});
test("Session CSV refuses stale templates/previews and locked years/papers without partially applying a class import", async () => {
  const f = await fixture(),
    rows = await template(f);
  rows[7][4] = "10";
  rows[8][5] = "20";
  const p = await preview(f, rows);
  ok(
    await call("PUT", `/v1/assessments/${f.papers[1].id}/marks/bulk`, {
      entries: [
        {
          enrollmentId: f.students[1].enrollment.id,
          state: "GRADED",
          awarded: 5,
          version: 0,
          reason: "Concurrent reviewed edit",
        },
      ],
    }),
  );
  ok(await apply(p), 409);
  assert.equal(await stored(f), undefined);
  assert.equal((await stored(f, 1, 1)).awarded, "5.00");
  assert.equal(
    (
      await pool.query(
        "SELECT state FROM exam_mark_import_batches WHERE id=$1",
        [p.batchId],
      )
    ).rows[0].state,
    "PREVIEW",
  );
  assert(!(await preview(f, rows)).canApply);
  const unapproved = await fixture(2, false),
    beforeApproval = await template(unapproved);
  beforeApproval[7][4] = "1";
  beforeApproval[8][4] = "2";
  assert(!(await preview(unapproved, beforeApproval)).canApply);
  ok(await call("POST", unapproved.base + "/scheme/approve", {}));
  const approved = await preview(unapproved, beforeApproval);
  assert(approved.canApply);
  ok(await apply(approved));
  ok(
    await call("POST", `/v1/assessments/${unapproved.papers[0].id}/submit`, {}),
  );
  const locked = await template(unapproved);
  locked[7][4] = "3";
  assert(!(await preview(unapproved, locked)).canApply);
  const roster = await template(f);
  roster[8][6] = "25";
  ok(
    await call("PATCH", `/v1/enrollments/${f.students[0].enrollment.id}`, {
      rollNumber: "R1",
      leftOn: null,
      state: "ACTIVE",
      reason: "Roster changed after template download",
    }),
  );
  ok(
    await call("POST", f.base + "/marks/import/preview", {
      csv: sheetCSV(roster),
      reason: "Stale roster reference",
    }),
    409,
  );
  ok(
    await call("PATCH", `/v1/academic-years/${unapproved.year.id}`, {
      state: "CLOSED",
    }),
  );
  const closed = await template(unapproved);
  closed[7][5] = "20";
  assert(!(await preview(unapproved, closed)).canApply);
  const raceA = await template(f),
    raceB = await template(f);
  raceA.find((row) => row[0] === f.students[0].student.student_number)![6] =
    "12";
  raceB.find((row) => row[0] === f.students[0].student.student_number)![6] =
    "13";
  const first = await preview(f, raceA),
    second = await preview(f, raceB);
  const outcomes = await Promise.all([apply(first), apply(second)]);
  assert.deepEqual(outcomes.map((r) => r.statusCode).sort(), [200, 409]);
  assert(["12.00", "13.00"].includes((await stored(f, 2, 0)).awarded));
  assert.equal((await stored(f, 2, 0)).version, 1);
});
test("Session sheets export every paper in Urdu layout, publish immutable PDFs, and keep later CSV corrections separate from frozen results", async () => {
  const f = await fixture(3),
    rows = await template(f, true),
    flags = 4 + f.papers.length + 4,
    expected = [30, 31, 27, 28, 55, 88, 61, 30, 24, 58, 81];
  const draft = await call("GET", f.base + "/result-sheet.pdf?source=LIVE");
  assert.equal(draft.statusCode, 200, draft.body);
  assert.equal(draft.rawPayload.subarray(0, 5).toString(), "%PDF-");
  const draftText = execFileSync("pdftotext", ["-layout", "-", "-"], {
    input: draft.rawPayload,
    encoding: "utf8",
  });
  assert(draftText.includes("DRAFT"));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < f.papers.length; j++) {
      rows[i + 7][j + 4] = String(
        i === 0 ? expected[j] : i === 1 ? f.papers[j].max : 0,
      );
      rows[i + 7][flags + j * 2 + 1] = "YES";
    }
  const p = await preview(f, rows);
  assert(p.canApply);
  ok(await apply(p));
  ok(
    await call("PUT", f.base + "/window", {
      attendanceFrom: day(-1),
      attendanceThrough: day(-1),
      examStart: day(-1),
      examEnd: day(-1),
    }),
  );
  ok(
    await call("PUT", `/v1/sections/${f.section.id}/calendar`, [
      {
        schoolDate: day(-1),
        isInstructional: true,
        countsForAttendance: true,
        note: "Synthetic exam attendance day",
      },
    ]),
  );
  ok(
    await call(
      "PUT",
      `/v1/sections/${f.section.id}/attendance/${day(-1)}`,
      {
        records: f.students.map((s) => ({
          enrollmentId: s.enrollment.id,
          status: "PRESENT",
        })),
      },
      { ...admin, "if-match": "0" },
    ),
  );
  ok(
    await call(
      "POST",
      `/v1/sections/${f.section.id}/attendance/${day(-1)}/submit`,
      {},
      { ...admin, "if-match": "1" },
    ),
  );
  const setting = ok(await call("GET", "/v1/policies"));
  ok(
    await call("PUT", "/v1/policies", {
      policy: institutePolicy,
      approve: true,
      version: setting.version,
    }),
  );
  for (const paper of f.papers) {
    ok(await call("POST", `/v1/assessments/${paper.id}/submit`, {}));
    ok(await call("POST", `/v1/assessments/${paper.id}/approve`, {}));
  }
  const validation = ok(
    await call(
      "POST",
      `/v1/results/${f.cycle.id}/${f.section.id}/validate`,
      {},
    ),
  );
  assert(validation.canPublish, JSON.stringify(validation.blockingErrors));
  const run = ok(
    await call(
      "POST",
      `/v1/results/${f.cycle.id}/${f.section.id}/publish`,
      { validationHash: validation.validationHash },
      { ...admin, "idempotency-key": randomUUID() },
    ),
    201,
  );
  const pdf = await call("GET", `/v1/results/${run.id}/sectionsheet.pdf`);
  assert.equal(
    ok(await call("GET", "/v1/results")).find(
      (entry: any) => entry.id === run.id,
    ).exam_cycle_id,
    f.cycle.id,
  );
  assert.equal(pdf.statusCode, 200);
  const hash = createHash("sha256").update(pdf.rawPayload).digest("hex");
  const text = execFileSync("pdftotext", ["-layout", "-", "-"], {
    input: pdf.rawPayload,
    encoding: "utf8",
  });
  assert(text.includes("P01") && text.includes("P02") && text.includes("P11"));
  assert(text.includes("513") && text.includes("600") && text.includes("85.5"));
  assert(!text.includes("DRAFT"));
  await mkdir(".data/reports", { recursive: true });
  await writeFile(
    ".data/reports/session-sheet-official-synthetic.pdf",
    pdf.rawPayload,
  );
  await writeFile(
    ".data/reports/session-sheet-draft-synthetic.pdf",
    draft.rawPayload,
  );
  const report = ok(await call("GET", f.base + "/result-sheet"));
  assert.equal(report.source, "PUBLISHED");
  const csv = await call("GET", `/v1/results/${run.id}/export.csv`);
  const matrix = parse(csv.body, { bom: true, relax_column_count: true });
  assert(matrix[6][4].includes("P01"));
  assert(matrix[6][14].includes("P11"));
  assert.equal(matrix[7][0], f.students[0].student.student_number);
  assert.equal(matrix[7][15], "513");
  assert.equal(matrix[7][16], "85.5");
  ok(
    await call("POST", `/v1/assessments/${f.papers[0].id}/reopen`, {
      reason: "Reviewed correction after published result",
    }),
  );
  const revised = await template(f);
  revised[7][4] = "29";
  const change = await preview(f, revised);
  assert.equal(change.publishedRevision, 1);
  assert(change.canApply);
  ok(await apply(change), 409);
  ok(await apply(change, true));
  const working = ok(await call("GET", f.base + "/result-sheet?source=LIVE"));
  assert.equal(
    working.snapshot.students.find(
      (s: any) => s.studentNumber === f.students[0].student.student_number,
    ).total,
    512,
  );
  const frozen = ok(await call("GET", f.base + "/result-sheet"));
  assert.equal(
    frozen.snapshot.students.find(
      (s: any) => s.studentNumber === f.students[0].student.student_number,
    ).total,
    513,
  );
  const old = await call("GET", `/v1/results/${run.id}/sectionsheet.pdf`);
  assert.equal(createHash("sha256").update(old.rawPayload).digest("hex"), hash);
  const panels = structuredClone(working.snapshot);
  panels.scheme.papers = [
    ...panels.scheme.papers,
    ...panels.scheme.papers.map((p: any) => ({
      ...p,
      id: randomUUID(),
      code: "EXTRA-" + p.code,
    })),
  ];
  const wide = await renderResultPDF(panels);
  const wideText = execFileSync("pdftotext", ["-layout", "-", "-"], {
    input: wide,
    encoding: "utf8",
  });
  assert(wideText.includes("EXTRA-P11"));
  assert(wideText.includes("Papers 15"));
  const decimals = structuredClone(working.snapshot);
  decimals.scheme.papers = decimals.scheme.papers
    .slice(0, 2)
    .map((p: any, i: number) => ({ ...p, max: i === 0 ? 0.1 : 0.2 }));
  const fractionalPDF = await renderResultPDF(decimals);
  const fractionalText = execFileSync("pdftotext", ["-layout", "-", "-"], {
    input: fractionalPDF,
    encoding: "utf8",
  });
  assert(fractionalText.includes("0.3"));
  assert(!fractionalText.includes("0.30000000000000004"));
});
