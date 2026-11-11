import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { buildApp } from "../apps/api/src/server.ts";
import { pool } from "../apps/api/src/db.ts";
import { institutePolicy } from "../packages/domain/src/index.ts";
const app = await buildApp();
after(async () => {
  await app.close();
  await pool.end();
});
const id = (key: string) => {
  const h = createHash("sha256")
    .update("hikmah-demo:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
let ip = 1;
async function login(role: string, password = process.env.DEMO_PASSWORD) {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    remoteAddress: `127.3.0.${ip++}`,
    payload: {
      email: role.includes("@") ? role : `${role}@hikmah.example`,
      password,
    },
  });
  assert.equal(r.statusCode, 200, r.body);
  return { authorization: `Bearer ${r.json().token}` };
}
const ok = (r: any, n = 200) => assert.equal(r.statusCode, n, r.body);
async function call(
  h: any,
  method: any,
  url: string,
  payload?: any,
  extra: any = {},
) {
  return app.inject({
    method,
    url,
    headers: { ...h, ...extra },
    ...(payload === undefined ? {} : { payload }),
  });
}
test("Roles: Mushrif covers every class paper, subject-only staff and Ameer cannot escape their scopes", async () => {
  const mushrif = await login("mushrif"),
    ameer = await login("ameer"),
    admin = await login("admin");
  const me = (await call(mushrif, "GET", "/v1/me")).json();
  assert(me.managedSections.includes(id("sectionA")));
  const papers = await call(mushrif, "GET", "/v1/assessments");
  ok(papers);
  assert(
    papers.json().filter((p: any) => p.section_id === id("sectionA")).length >=
      11,
  );
  ok(await call(mushrif, "GET", `/v1/assessments/${id("P04")}/marks`));
  ok(
    await call(mushrif, "GET", `/v1/sections/${id("sectionB")}/curriculum`),
    403,
  );
  for (const url of [
    "/v1/assessments",
    "/v1/results",
    "/v1/exam-cycles",
    `/v1/sections/${id("sectionA")}/curriculum`,
    `/v1/students/${id("SYN-001")}/performance`,
  ])
    ok(await call(ameer, "GET", url), 403);
  const password = randomBytes(24).toString("hex"),
    email = `subject-${randomUUID()}@hikmah.example`;
  const account = await call(admin, "POST", "/v1/users", {
    email,
    name: "Subject-only rule test",
    password,
  });
  ok(account, 201);
  ok(
    await call(admin, "POST", `/v1/offerings/${id("offeringP01")}/teachers`, {
      teacher_user_id: account.json().id,
      starts_on: "2026-01-01",
    }),
  );
  const teacher = await login(email, password);
  assert.equal(
    (await call(teacher, "GET", "/v1/assessments")).json().length,
    1,
  );
  assert.equal(
    (
      await call(teacher, "GET", `/v1/sections/${id("sectionA")}/subjects`)
    ).json().length,
    1,
  );
  ok(await call(teacher, "GET", `/v1/assessments/${id("P04")}/marks`), 403);
  ok(
    await call(
      teacher,
      "GET",
      `/v1/sections/${id("sectionA")}/attendance/2026-11-01`,
    ),
    403,
  );
  ok(
    await call(teacher, "GET", `/v1/students/${id("SYN-001")}/performance.pdf`),
    403,
  );
  ok(
    await call(teacher, "PUT", `/v1/users/${account.json().id}/password`, {
      password: randomBytes(24).toString("hex"),
      reason: "Should not be permitted",
    }),
    403,
  );
  ok(
    await call(admin, "PUT", `/v1/users/${account.json().id}/password`, {
      password: randomBytes(24).toString("hex"),
      reason: "Authorized password change test",
    }),
  );
  ok(await call(teacher, "GET", "/v1/me"), 401);
});
test("Academic-day attendance, shared curriculum, concessions, report export and promotion preserve student history", async () => {
  const admin = await login("admin"),
    mushrif = await login("mushrif"),
    ameer = await login("ameer");
  const today = (await call(admin, "GET", "/v1/me")).json().today,
    day = (offset: number) =>
      new Date(Date.parse(today) + offset * 86400000)
        .toISOString()
        .slice(0, 10);
  const year = await call(admin, "POST", "/v1/academic-years", {
    label: "Rules test " + randomUUID(),
    start_date: day(-30),
    end_date: day(60),
    state: "ACTIVE",
  });
  ok(year, 201);
  const section = (
    await call(admin, "POST", "/v1/sections", {
      academic_year_id: year.json().id,
      program_id: id("program"),
      level_id: id("level1"),
      code: randomUUID().slice(0, 6),
      name: "Rules test class",
    })
  ).json();
  assert(section.id);
  ok(
    await call(admin, "POST", `/v1/sections/${section.id}/staff`, {
      user_id: id("mushrif"),
      role: "MUSHRIF",
      starts_on: day(-30),
    }),
  );
  ok(
    await call(admin, "POST", `/v1/sections/${section.id}/staff`, {
      user_id: id("ameer"),
      role: "AMEER",
      starts_on: day(-30),
      ameerOverrideReason: "Synthetic scope test with recorded override",
    }),
  );
  const learners: any[] = [];
  for (let i = 0; i < 3; i++) {
    const s = await call(admin, "POST", "/v1/students", {
      student_number: "RULE-" + randomUUID().slice(0, 10),
      full_name: "Rule learner " + i,
    });
    ok(s, 201);
    const e = await call(
      admin,
      "POST",
      `/v1/sections/${section.id}/enrollments`,
      {
        student_id: s.json().id,
        roll_number: String(i + 1),
        joined_on: day(-30),
      },
    );
    ok(e);
    learners.push({ student: s.json(), enrollment: e.json() });
  }
  const calendar = {
    from: day(-3),
    through: today,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    holidays: [{ date: day(-1), note: "Declared holiday" }],
  };
  ok(
    await call(
      ameer,
      "PUT",
      `/v1/sections/${section.id}/calendar/range`,
      calendar,
    ),
    403,
  );
  ok(
    await call(
      mushrif,
      "PUT",
      `/v1/sections/${section.id}/calendar/range`,
      calendar,
    ),
  );
  let summary = (
    await call(ameer, "GET", `/v1/sections/${section.id}/attendance-summary`)
  ).json();
  assert.equal(summary.students[0].academicDays, 3);
  assert.equal(summary.students[0].unmarked, 3);
  assert.equal(summary.students[0].absent, 0);
  assert.equal(summary.students[0].percent, null);
  ok(
    await call(
      mushrif,
      "PUT",
      `/v1/sections/${section.id}/attendance/${day(-1)}`,
      { records: [] },
      { "if-match": "0" },
    ),
    422,
  );
  for (const [index, date] of [day(-3), day(-2), today].entries()) {
    const h = date === today ? ameer : mushrif;
    const records = learners.map((l, i) => ({
      enrollmentId: l.enrollment.id,
      status: i === 0 ? ["PRESENT", "HALF", "LEAVE"][index] : "PRESENT",
    }));
    ok(
      await call(
        h,
        "PUT",
        `/v1/sections/${section.id}/attendance/${date}`,
        { records },
        { "if-match": "0" },
      ),
    );
    ok(
      await call(
        h,
        "POST",
        `/v1/sections/${section.id}/attendance/${date}/submit`,
        {},
        { "if-match": "1" },
      ),
    );
  }
  summary = (
    await call(ameer, "GET", `/v1/sections/${section.id}/attendance-summary`)
  ).json();
  const count = summary.students.find(
    (s: any) => s.studentId === learners[0].student.id,
  );
  assert.equal(count.displayPercent, "75.0");
  assert.equal(count.present, 1);
  assert.equal(count.half, 1);
  assert.equal(count.leave, 1);
  ok(
    await call(
      ameer,
      "POST",
      `/v1/sections/${section.id}/attendance/${today}/reopen`,
      { reason: "Forbidden Ameer correction" },
    ),
    403,
  );
  const offerings = [];
  for (let i = 0; i < 6; i++) {
    const r = await call(
      mushrif,
      "POST",
      `/v1/sections/${section.id}/subject-catalog`,
      { code: "RULE-" + randomUUID().slice(0, 8), name: "Subject " + i },
    );
    ok(r);
    offerings.push(r.json().id);
  }
  const scheme = {
    papers: offerings.map((offeringId, i) => ({
      offeringId,
      code: "R" + i,
      label: "Rule paper " + i,
      max: 100,
      type: "WRITTEN",
      pattern: "",
      date: null,
    })),
    groups: offerings.map((_, i) => ({
      name: "Rule group " + i,
      max: 100,
      paperCodes: ["R" + i],
    })),
  };
  ok(
    await call(mushrif, "PUT", `/v1/sections/${section.id}/curriculum`, {
      scheme,
      version: 0,
    }),
  );
  const cycles = (await call(admin, "GET", "/v1/exam-cycles"))
    .json()
    .filter((c: any) => c.academic_year_id === year.json().id);
  assert.equal(cycles.length, 3);
  for (const c of cycles)
    ok(
      await call(
        mushrif,
        "POST",
        `/v1/exam-cycles/${c.id}/sections/${section.id}/from-curriculum`,
        {},
      ),
    );
  const first = cycles[0];
  ok(
    await call(
      mushrif,
      "PUT",
      `/v1/exam-cycles/${first.id}/sections/${section.id}/scheme`,
      { ...scheme, groups: scheme.groups.slice(0, 5) },
    ),
    400,
  );
  const mismatched = structuredClone(scheme);
  mismatched.papers[0].code = "WRONG";
  mismatched.groups[0].paperCodes = ["WRONG"];
  ok(
    await call(
      mushrif,
      "PUT",
      `/v1/exam-cycles/${first.id}/sections/${section.id}/scheme`,
      mismatched,
    ),
    422,
  );
  ok(
    await call(
      mushrif,
      "PUT",
      `/v1/exam-cycles/${first.id}/sections/${section.id}/window`,
      {
        attendanceFrom: day(-3),
        attendanceThrough: today,
        examStart: today,
        examEnd: today,
        acknowledgeOverlap: true,
      },
    ),
  );
  ok(
    await call(
      mushrif,
      "POST",
      `/v1/exam-cycles/${first.id}/sections/${section.id}/scheme/approve`,
      {},
    ),
  );
  const papers = (
    await call(
      mushrif,
      "GET",
      `/v1/exam-cycles/${first.id}/sections/${section.id}/scheme`,
    )
  ).json().scheme.papers;
  for (const [index, p] of papers.entries()) {
    ok(
      await call(mushrif, "PUT", `/v1/assessments/${p.id}/marks/bulk`, {
        entries: learners.map((l, i) => ({
          enrollmentId: l.enrollment.id,
          state: "GRADED",
          awarded: i === 2 ? 100 : 90,
          version: 0,
          onLeave: i === 2 && index === 0,
          onTime: !(i === 2 && index === 0),
        })),
      }),
    );
    ok(await call(mushrif, "POST", `/v1/assessments/${p.id}/submit`, {}));
    ok(await call(mushrif, "POST", `/v1/assessments/${p.id}/approve`, {}));
  }
  const settings = (await call(admin, "GET", "/v1/policies")).json();
  ok(
    await call(admin, "PUT", "/v1/policies", {
      policy: institutePolicy,
      approve: true,
      version: settings.version,
    }),
  );
  const report = await call(
    mushrif,
    "POST",
    `/v1/results/${first.id}/${section.id}/validate`,
    {},
  );
  ok(report);
  assert.equal(
    report.json().canPublish,
    true,
    JSON.stringify(report.json().blockingErrors),
  );
  const students = report.json().snapshot.students;
  assert.deepEqual(
    students.map((s: any) => s.rank).sort(),
    [1, 1, null].sort(),
  );
  assert.equal(
    students.find((s: any) => s.enrollmentId === learners[2].enrollment.id)
      .passing,
    true,
  );
  const pub = await call(
    mushrif,
    "POST",
    `/v1/results/${first.id}/${section.id}/publish`,
    { validationHash: report.json().validationHash },
    { "idempotency-key": randomUUID() },
  );
  ok(pub, 201);
  const person = await call(
    mushrif,
    "GET",
    `/v1/students/${learners[0].student.id}/performance?yearId=${year.json().id}`,
  );
  ok(person);
  assert.equal(person.json().years[0].attendance.displayPercent, "75.0");
  assert.equal(person.json().years[0].sessions[0].official, true);
  const pdf = await call(
    mushrif,
    "GET",
    `/v1/students/${learners[0].student.id}/performance.pdf?yearId=${year.json().id}`,
  );
  ok(pdf);
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
  await mkdir(".data/reports", { recursive: true });
  await writeFile(".data/reports/academic-history-test.pdf", pdf.rawPayload);
  const text = execFileSync("pdftotext", [
    ".data/reports/academic-history-test.pdf",
    "-",
  ]).toString();
  assert(text.includes("75.0"));
  assert(text.includes("HALF") || text.includes("Half"));
  assert(text.includes("PUBLISHED"));
  const csv = await call(
    mushrif,
    "GET",
    `/v1/sections/${section.id}/performance.csv?cycleId=${first.id}`,
  );
  ok(csv);
  assert(csv.body.includes("attendance_percent"));
  assert(csv.body.includes("75.0"));
  const nextYear = await call(admin, "POST", "/v1/academic-years", {
    label: "Next rules " + randomUUID(),
    start_date: day(61),
    end_date: day(400),
    state: "PLANNED",
  });
  ok(nextYear, 201);
  const next = (
    await call(admin, "POST", "/v1/sections", {
      academic_year_id: nextYear.json().id,
      program_id: id("program"),
      level_id: id("level2"),
      code: randomUUID().slice(0, 6),
      name: "Promoted class",
    })
  ).json();
  ok(
    await call(admin, "POST", `/v1/sections/${section.id}/rollover`, {
      targetSection: next.id,
      joinedOn: day(61),
      enrollmentIds: [learners[0].enrollment.id],
    }),
  );
  const history = (
    await call(
      mushrif,
      "GET",
      `/v1/students/${learners[0].student.id}/performance`,
    )
  ).json();
  assert.equal(history.years.length, 2);
  assert.equal(history.student.id, learners[0].student.id);
  assert(
    history.years.some((y: any) => y.sessions.some((s: any) => s.official)),
  );
  const privateStudent = await call(admin, "POST", "/v1/students", {
    student_number: "PRIVATE-" + randomUUID().slice(0, 8),
    full_name: "Unassigned student",
  });
  ok(
    await call(
      mushrif,
      "GET",
      `/v1/students/${privateStudent.json().id}/performance`,
    ),
    403,
  );
  ok(
    await call(admin, "PATCH", `/v1/academic-years/${year.json().id}`, {
      state: "CLOSED",
    }),
  );
  ok(
    await call(
      mushrif,
      "GET",
      `/v1/students/${learners[0].student.id}/performance`,
    ),
  );
  ok(
    await call(mushrif, "PUT", `/v1/assessments/${papers[0].id}/marks/bulk`, {
      entries: [
        {
          enrollmentId: learners[0].enrollment.id,
          state: "GRADED",
          awarded: 89,
          version: 1,
          onTime: true,
        },
      ],
    }),
    422,
  );
});
