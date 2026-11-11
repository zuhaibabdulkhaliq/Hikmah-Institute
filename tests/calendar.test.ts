import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/server.ts";
import { pool } from "../apps/api/src/db.ts";
import type { CalendarChange } from "../packages/domain/src/index.ts";
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
    remoteAddress: `127.5.0.${ip++}`,
    payload: {
      email: `${role}@hikmah.example`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  assert.equal(r.statusCode, 200, r.body);
  return { authorization: `Bearer ${r.json().token}` };
}
const admin = await login("admin"),
  mushrif = await login("mushrif"),
  ameer = await login("ameer"),
  subject = await login("subject");
const today = (await app.inject({ url: "/v1/me", headers: admin })).json()
  .today as string;
const day = (offset: number) =>
  new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10);
const sundayOffset = -new Date(today).getUTCDay() - 7;
const week = (offset: number) => day(sundayOffset + offset);
async function call(
  method: any,
  url: string,
  payload?: any,
  headers: any = admin,
) {
  return app.inject({
    method,
    url,
    headers,
    ...(payload === undefined ? {} : { payload }),
  });
}
function ok(r: any, code = 200) {
  assert.equal(r.statusCode, code, r.body);
  return r.json();
}
async function fixture(count = 1) {
  const programs = ok(await call("GET", "/v1/programs"));
  const levels = ok(await call("GET", "/v1/levels")).sort(
    (a: any, b: any) => a.ordinal - b.ordinal,
  );
  const year = ok(
    await call("POST", "/v1/academic-years", {
      label: `Calendar ${randomUUID()}`,
      start_date: day(-60),
      end_date: day(365),
      state: "ACTIVE",
    }),
    201,
  );
  const sections = [];
  for (let i = 0; i < count; i++)
    sections.push(
      ok(
        await call("POST", "/v1/sections", {
          academic_year_id: year.id,
          program_id: programs.find((p: any) => p.code === "EVENING").id,
          level_id: levels[i].id,
          code: `C${i + 1}`,
          name: `Calendar class ${i + 1}`,
        }),
        201,
      ),
    );
  return { year, sections, programs, levels };
}
const weekly = (
  ids: string[],
  weekdays: number[],
  from = week(0),
  through = week(6),
): CalendarChange => ({
  kind: "WEEKLY",
  sectionIds: ids,
  from,
  through,
  weekdays,
  reason: "Confirmed class teaching timetable",
});
async function preview(change: CalendarChange, headers = admin) {
  return ok(await call("POST", "/v1/calendars/preview", change, headers));
}
async function apply(change: CalendarChange, headers = admin, ack = false) {
  const p = await preview(change, headers);
  ok(
    await call(
      "POST",
      "/v1/calendars/apply",
      { ...change, previewHash: p.hash, acknowledgeRecordedChanges: ack },
      headers,
    ),
  );
  return p;
}
async function calendar(
  section: string,
  from = week(0),
  through = week(6),
  headers = admin,
) {
  return ok(
    await call(
      "GET",
      `/v1/sections/${section}/academic-calendar?from=${from}&through=${through}`,
      undefined,
      headers,
    ),
  );
}
test("Calendar: each program and level keeps its own 1–7 day teaching week and persisted schedules", async () => {
  const f = await fixture(7);
  const sets = [
    [1],
    [1, 6],
    [1, 3, 4, 6],
    [1, 2, 4, 6],
    [1, 2, 3, 4, 6],
    [0, 1, 2, 3, 4, 6],
    [0, 1, 2, 3, 4, 5, 6],
  ];
  for (let i = 0; i < 7; i++) {
    const p = await apply(weekly([f.sections[i].id], sets[i]));
    assert.equal(p.sections[0].academicDays, sets[i].length);
    const c = await calendar(f.sections[i].id);
    assert.equal(
      c.days.filter((d: any) => d.countsForAttendance).length,
      sets[i].length,
    );
    assert.deepEqual(c.patterns[0].weekdays, sets[i]);
    for (const d of c.days)
      assert.equal(
        d.countsForAttendance,
        sets[i].includes(new Date(d.date).getUTCDay()),
      );
  }
  const morning = ok(
    await call("POST", "/v1/sections", {
      academic_year_id: f.year.id,
      program_id: f.programs.find((p: any) => p.code === "MORNING").id,
      level_id: f.levels[3].id,
      code: "M",
      name: "Same level morning",
    }),
    201,
  );
  assert(
    (await calendar(morning.id)).days.every(
      (d: any) => d.source === "UNCONFIGURED",
    ),
  );
  await apply(weekly([morning.id], [0, 1, 2, 3, 4, 5, 6]));
  assert.equal(
    (await calendar(f.sections[3].id)).days.filter(
      (d: any) => d.countsForAttendance,
    ).length,
    4,
  );
  const meta = ok(await call("GET", "/v1/calendars")).find(
    (s: any) => s.id === f.sections[3].id,
  );
  assert.equal(meta.configured_days, 7);
  assert.deepEqual(meta.patterns[0].weekdays, [1, 2, 4, 6]);
  assert.equal(meta.calendar_version, 1);
  await apply(weekly([morning.id], []));
  assert.equal(
    (await calendar(morning.id)).days.filter((d: any) => d.countsForAttendance)
      .length,
    0,
  );
});
test("Calendar: holidays, extra classes and no-attendance events survive edits; seasonal changes split only the selected range", async () => {
  const {
    sections: [s],
  } = await fixture();
  await apply(weekly([s.id], [1, 2, 4, 6], week(0), week(20)));
  await apply({
    kind: "EXCEPTION",
    sectionIds: [s.id],
    from: week(1),
    through: week(3),
    dayType: "HOLIDAY",
    note: "Three-day vacation",
    reason: "Institute vacation announcement",
  });
  await apply({
    kind: "EXCEPTION",
    sectionIds: [s.id],
    from: week(0),
    through: week(0),
    dayType: "TEACHING",
    note: "Extra Sunday class",
    reason: "Make-up teaching session",
  });
  await apply({
    kind: "EXCEPTION",
    sectionIds: [s.id],
    from: week(4),
    through: week(4),
    dayType: "NO_ATTENDANCE",
    note: "Institute event",
    reason: "No daily roll call at this event",
  });
  const p = await apply(
    weekly([s.id], [0, 1, 2, 3, 4, 5, 6], week(0), week(20)),
  );
  assert.equal(p.sections[0].preservedExceptions, 5);
  let c = await calendar(s.id);
  assert.equal(c.days[0].countsForAttendance, true);
  assert.equal(c.days[1].note, "Three-day vacation");
  assert.equal(c.days[1].countsForAttendance, false);
  assert.equal(c.days[4].isInstructional, true);
  assert.equal(c.days[4].countsForAttendance, false);
  await apply(weekly([s.id], [1, 3, 6], week(7), week(13)));
  c = await calendar(s.id, week(0), week(20));
  assert.equal(c.patterns.length, 3);
  assert.deepEqual(
    c.patterns.map((r: any) => [r.starts_on, r.ends_on]),
    [
      [week(0), week(6)],
      [week(7), week(13)],
      [week(14), week(20)],
    ],
  );
  assert.equal(
    c.days.slice(7, 14).filter((d: any) => d.countsForAttendance).length,
    3,
  );
  assert.equal(
    c.days.slice(14).filter((d: any) => d.countsForAttendance).length,
    7,
  );
  await apply({
    kind: "RESTORE",
    sectionIds: [s.id],
    from: week(0),
    through: week(6),
    reason: "Vacation and extra-day exceptions withdrawn",
  });
  c = await calendar(s.id);
  assert(
    c.days.every((d: any) => d.countsForAttendance && d.source === "WEEKLY"),
  );
  // Legacy clients create protected exceptions and advance the same version.
  const beforeVersion = c.version;
  ok(
    await call("PUT", `/v1/sections/${s.id}/calendar`, [
      {
        schoolDate: week(1),
        isInstructional: false,
        countsForAttendance: false,
        note: "Legacy client holiday",
      },
    ]),
  );
  assert.equal((await calendar(s.id)).version, beforeVersion + 1);
  ok(
    await call("PUT", `/v1/sections/${s.id}/calendar/range`, {
      from: week(0),
      through: week(6),
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      holidays: [],
    }),
  );
  assert.equal((await calendar(s.id)).days[1].note, "Legacy client holiday");
  assert.equal((await calendar(s.id)).days[1].countsForAttendance, false);
});
test("Calendar: RBAC, academic-year limits, validation and all-or-nothing batch edits are enforced", async () => {
  const {
    year,
    sections: [a, b],
  } = await fixture(2);
  const me = ok(await call("GET", "/v1/me", undefined, mushrif));
  ok(
    await call("POST", `/v1/sections/${a.id}/staff`, {
      user_id: me.userId,
      role: "MUSHRIF",
      starts_on: day(-60),
    }),
  );
  for (const h of [ameer, subject]) {
    ok(await call("GET", "/v1/calendars", undefined, h), 403);
    ok(
      await call("POST", "/v1/calendars/preview", weekly([a.id], [1, 2]), h),
      403,
    );
    ok(
      await call(
        "GET",
        `/v1/sections/${a.id}/academic-calendar?from=${week(0)}&through=${week(6)}`,
        undefined,
        h,
      ),
      403,
    );
  }
  await apply(weekly([a.id], [1, 2]), mushrif);
  await assert.rejects(
    pool.query(
      "INSERT INTO section_calendar_patterns(section_id,starts_on,ends_on,weekdays) VALUES($1,$2,$3,$4)",
      [a.id, week(1), week(2), [1]],
    ),
    /overlapping calendar patterns/,
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO section_calendar_patterns(section_id,starts_on,ends_on,weekdays) VALUES($1,$2,$3,$4)",
      [a.id, day(20), day(21), [1, 1]],
    ),
    /duplicate teaching weekday/,
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO section_calendar_exceptions(section_id,school_date,is_instructional,counts_for_attendance,note) VALUES($1,$2,false,false,'Invalid holiday')",
      [a.id, day(-61)],
    ),
    /calendar exception outside academic year/,
  );
  const p = await preview(weekly([a.id, b.id], [1, 2, 3]));
  ok(
    await call(
      "POST",
      "/v1/calendars/apply",
      { ...weekly([a.id, b.id], [1, 2, 3]), previewHash: p.hash },
      mushrif,
    ),
    403,
  );
  assert.equal((await calendar(a.id)).version, 1);
  assert.equal((await calendar(b.id)).version, 0);
  ok(
    await call(
      "POST",
      "/v1/calendars/preview",
      weekly([a.id], [1], day(-61), week(6)),
    ),
    422,
  );
  ok(await call("POST", "/v1/calendars/preview", weekly([a.id], [7])), 400);
  ok(await call("POST", "/v1/calendars/preview", weekly([a.id], [1, 1])), 422);
  ok(
    await call("POST", "/v1/calendars/preview", weekly([a.id, a.id], [1])),
    422,
  );
  ok(
    await call(
      "POST",
      "/v1/calendars/preview",
      weekly([a.id], [1], "0001-01-01", "9999-12-31"),
    ),
    422,
  );
  await apply({
    kind: "EXCEPTION",
    sectionIds: [b.id],
    from: week(0),
    through: week(0),
    dayType: "HOLIDAY",
    note: "Closure",
    reason: "Explicit exception before schedule",
  });
  ok(
    await call("POST", "/v1/calendars/preview", {
      kind: "RESTORE",
      sectionIds: [b.id],
      from: week(0),
      through: week(0),
      reason: "No schedule exists for this day",
    }),
    422,
  );
  ok(await call("PATCH", `/v1/academic-years/${year.id}`, { state: "CLOSED" }));
  ok(await call("POST", "/v1/calendars/preview", weekly([a.id], [1])), 404);
  ok(
    await call("POST", "/v1/calendars/apply", {
      ...weekly([a.id, b.id], [1, 2, 3]),
      previewHash: p.hash,
    }),
    404,
  );
  assert.equal(
    (await calendar(a.id)).days.filter((d: any) => d.countsForAttendance)
      .length,
    2,
  );
});
test("Calendar: stale previews cannot overwrite changes, including legacy edits and attendance saved after preview", async () => {
  const {
    sections: [s],
  } = await fixture();
  const change = weekly([s.id], [1, 2, 3]);
  const p = await preview(change);
  await apply(weekly([s.id], [0, 1, 2, 3, 4, 5, 6]));
  ok(
    await call("POST", "/v1/calendars/apply", {
      ...change,
      previewHash: p.hash,
    }),
    409,
  );
  const p2 = await preview(change);
  ok(
    await call("PUT", `/v1/sections/${s.id}/calendar`, [
      {
        schoolDate: week(1),
        isInstructional: false,
        countsForAttendance: false,
        note: "Another administrator's holiday",
      },
    ]),
  );
  ok(
    await call("POST", "/v1/calendars/apply", {
      ...change,
      previewHash: p2.hash,
    }),
    409,
  );
  const p3 = await preview(change);
  ok(
    await call(
      "PUT",
      `/v1/sections/${s.id}/attendance/${week(0)}`,
      { records: [] },
      { ...admin, "if-match": "0" },
    ),
  );
  ok(
    await call("POST", "/v1/calendars/apply", {
      ...change,
      previewHash: p3.hash,
      acknowledgeRecordedChanges: true,
    }),
    409,
  );
  const fresh = await preview(change);
  ok(
    await call("POST", "/v1/calendars/apply", {
      ...change,
      previewHash: fresh.hash,
      acknowledgeRecordedChanges: true,
    }),
  );
  ok(
    await call("POST", "/v1/calendars/apply", {
      ...change,
      previewHash: fresh.hash,
      acknowledgeRecordedChanges: true,
    }),
    409,
  );
});
test("Calendar: changes to recorded days require acknowledgement and preserve entries, audit and attendance arithmetic", async () => {
  const {
    sections: [s],
  } = await fixture();
  const student = ok(
    await call("POST", "/v1/students", {
      student_number: `CAL-${randomUUID()}`,
      full_name: "Synthetic calendar learner",
    }),
    201,
  );
  const enrollment = ok(
    await call("POST", `/v1/sections/${s.id}/enrollments`, {
      student_id: student.id,
      roll_number: "1",
      joined_on: week(0),
    }),
  );
  await apply(weekly([s.id], [0, 1, 2, 3, 4, 5, 6]));
  const statuses = [
    "HALF",
    "PRESENT",
    "LEAVE",
    "ABSENT",
    "ABSENT",
    "ABSENT",
    "ABSENT",
  ];
  for (let i = 0; i < 7; i++) {
    ok(
      await call(
        "PUT",
        `/v1/sections/${s.id}/attendance/${week(i)}`,
        { records: [{ enrollmentId: enrollment.id, status: statuses[i] }] },
        { ...admin, "if-match": "0" },
      ),
    );
    ok(
      await call(
        "POST",
        `/v1/sections/${s.id}/attendance/${week(i)}/submit`,
        {},
        { ...admin, "if-match": "1" },
      ),
    );
  }
  const summary = () =>
    call("GET", `/v1/sections/${s.id}/attendance-summary`).then(
      (r) => ok(r).students[0],
    );
  assert.equal((await summary()).displayPercent, "25.0");
  const exception: CalendarChange = {
    kind: "EXCEPTION",
    sectionIds: [s.id],
    from: week(0),
    through: week(0),
    dayType: "HOLIDAY",
    note: "Retrospective closure",
    reason: "Institute confirms closure on recorded date",
  };
  const p = await preview(exception);
  assert.equal(p.sections[0].recordedDatesAffected, 1);
  ok(
    await call("POST", "/v1/calendars/apply", {
      ...exception,
      previewHash: p.hash,
    }),
    409,
  );
  assert.equal((await summary()).academicDays, 7);
  ok(
    await call("POST", "/v1/calendars/apply", {
      ...exception,
      previewHash: p.hash,
      acknowledgeRecordedChanges: true,
    }),
  );
  assert.equal((await summary()).academicDays, 6);
  assert.equal((await summary()).displayPercent, "20.0");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM attendance_records r JOIN attendance_sheets sh ON sh.id=r.sheet_id WHERE sh.section_id=$1",
        [s.id],
      )
    ).rows[0].n,
    7,
  );
  await apply(
    {
      kind: "RESTORE",
      sectionIds: [s.id],
      from: week(0),
      through: week(0),
      reason: "Restore confirmed original teaching day",
    },
    admin,
    true,
  );
  assert.equal((await summary()).displayPercent, "25.0");
  await apply(weekly([s.id], [0, 1, 2, 3, 4, 5, 6], day(1), day(7)));
  assert.equal((await summary()).academicDays, 7);
  assert.equal((await summary()).leave, 1);
  assert.equal((await summary()).half, 1);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE object_id=$1 AND action LIKE 'CALENDAR_%'",
        [s.id],
      )
    ).rows[0].n,
    4,
  );
});
