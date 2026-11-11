import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { pool, transaction, type DB } from "./db.ts";
import {
  actor,
  audit,
  capabilities,
  check,
  manage,
  scope,
  type Actor,
} from "./security.ts";
import {
  calendarChangeSchema,
  calendarApplySchema,
  schoolDate,
  uuid,
  type CalendarChange,
  type CalendarPattern,
  type CalendarPreview,
} from "../../../packages/domain/src/index.ts";

const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10);
const shift = (date: string, days: number) =>
  dateOf(Date.parse(date) + days * 86400000);
function dates(from: string, through: string) {
  const result: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(through); t += 86400000)
    result.push(dateOf(t));
  return result;
}
type Day = {
  day: string;
  instructional: boolean;
  counts: boolean;
  note: string;
};
type Existing = Day & {
  sheet_state: string | null;
  sheet_version: number | null;
};
type Exception = Day;
async function rowsFor(db: DB, section: string, from: string, through: string) {
  const days = (
    await db.query<Existing>(
      `
    SELECT c.school_date::text AS day,c.is_instructional AS instructional,
      c.counts_for_attendance AS counts,COALESCE(c.calendar_note,'') AS note,
      s.state AS sheet_state,s.version AS sheet_version
    FROM section_calendar_days c LEFT JOIN attendance_sheets s
      ON s.section_id=c.section_id AND s.school_date=c.school_date
    WHERE c.section_id=$1 AND c.school_date BETWEEN $2 AND $3 ORDER BY c.school_date
  `,
      [section, from, through],
    )
  ).rows;
  const exceptions = (
    await db.query<Exception>(
      `
    SELECT school_date::text AS day,is_instructional AS instructional,
      counts_for_attendance AS counts,note FROM section_calendar_exceptions
    WHERE section_id=$1 AND school_date BETWEEN $2 AND $3 ORDER BY school_date
  `,
      [section, from, through],
    )
  ).rows;
  const patterns = (
    await db.query<CalendarPattern>(
      `
    SELECT id,starts_on::text,ends_on::text,weekdays FROM section_calendar_patterns
    WHERE section_id=$1 AND starts_on<=$3 AND ends_on>=$2 ORDER BY starts_on,id
  `,
      [section, from, through],
    )
  ).rows;
  return { days, exceptions, patterns };
}
async function lockSections(
  db: DB,
  a: Actor,
  ids: string[],
  from: string,
  through: string,
) {
  check(
    from <= through &&
      (Date.parse(through) - Date.parse(from)) / 86400000 < 1100,
    "Choose a date range of at most three years",
  );
  check(new Set(ids).size === ids.length, "Select each section only once");
  const result = [];
  for (const id of [...ids].sort()) {
    await manage(db, a, id);
    const s = (
      await db.query(
        `
      SELECT s.id,s.name,s.calendar_version,y.start_date::text AS start,y.end_date::text AS finish
      FROM sections s JOIN academic_years y ON y.id=s.academic_year_id
      WHERE s.id=$1 FOR UPDATE OF s
    `,
        [id],
      )
    ).rows[0];
    check(
      from >= s.start && through <= s.finish,
      `Calendar range must be inside the academic year for ${s.name}`,
    );
    result.push(s);
  }
  return result;
}
function weeklyDay(day: string, weekdays: number[]): Day {
  const academic = weekdays.includes(new Date(day).getUTCDay());
  return {
    day,
    instructional: academic,
    counts: academic,
    note: academic ? "Academic day" : "Weekly day off",
  };
}
function exceptionDay(
  day: string,
  change: Extract<CalendarChange, { kind: "EXCEPTION" }>,
): Day {
  return {
    day,
    instructional: change.dayType !== "HOLIDAY",
    counts: change.dayType === "TEACHING",
    note: change.note,
  };
}
async function plan(db: DB, a: Actor, change: CalendarChange) {
  if (change.kind === "WEEKLY")
    check(
      new Set(change.weekdays).size === change.weekdays.length,
      "Choose each weekday only once",
    );
  const sections = await lockSections(
    db,
    a,
    change.sectionIds,
    change.from,
    change.through,
  );
  const prepared = [];
  for (const section of sections) {
    const old = await rowsFor(db, section.id, change.from, change.through);
    const oldMap = new Map(old.days.map((d) => [d.day, d]));
    const exceptionMap = new Map(old.exceptions.map((d) => [d.day, d]));
    const next: Day[] = [];
    for (const day of dates(change.from, change.through)) {
      const exception = exceptionMap.get(day);
      if (change.kind === "EXCEPTION") next.push(exceptionDay(day, change));
      else if (change.kind === "WEEKLY")
        next.push(exception ?? weeklyDay(day, change.weekdays));
      else if (exception) {
        const pattern = old.patterns.find(
          (p) => p.starts_on <= day && p.ends_on >= day,
        );
        check(
          pattern,
          `Set a weekly schedule covering ${day} before restoring that exception`,
        );
        next.push(weeklyDay(day, pattern.weekdays));
      } else if (oldMap.has(day)) next.push(oldMap.get(day)!);
    }
    let changedDates = 0,
      addedAcademicDays = 0,
      removedAcademicDays = 0,
      recordedDatesAffected = 0;
    for (const day of next) {
      const before = oldMap.get(day.day);
      const wasAcademic = !!before?.instructional && !!before.counts;
      const isAcademic = day.instructional && day.counts;
      if (
        !before ||
        before.instructional !== day.instructional ||
        before.counts !== day.counts ||
        before.note !== day.note
      )
        changedDates++;
      if (!wasAcademic && isAcademic) addedAcademicDays++;
      if (wasAcademic && !isAcademic) removedAcademicDays++;
      if (before?.sheet_state && wasAcademic !== isAcademic)
        recordedDatesAffected++;
    }
    prepared.push({
      section,
      old,
      next,
      summary: {
        id: section.id,
        name: section.name,
        version: section.calendar_version,
        academicDays: next.filter((d) => d.instructional && d.counts).length,
        changedDates,
        addedAcademicDays,
        removedAcademicDays,
        recordedDatesAffected,
        preservedExceptions:
          change.kind === "WEEKLY" ? old.exceptions.length : 0,
      },
    });
  }
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        change,
        state: prepared.map((p) => ({ section: p.section, old: p.old })),
      }),
    )
    .digest("hex");
  return {
    prepared,
    preview: {
      hash,
      from: change.from,
      through: change.through,
      sections: prepared.map((p) => p.summary),
    } satisfies CalendarPreview,
  };
}
async function materialize(db: DB, section: string, days: Day[]) {
  if (!days.length) return;
  await db.query(
    `
    INSERT INTO section_calendar_days(section_id,school_date,is_instructional,counts_for_attendance,calendar_note)
    SELECT $1,x.day::date,x.instructional,x.counts,x.note
    FROM jsonb_to_recordset($2::jsonb) AS x(day text,instructional boolean,counts boolean,note text)
    ON CONFLICT(section_id,school_date) DO UPDATE SET is_instructional=EXCLUDED.is_instructional,
      counts_for_attendance=EXCLUDED.counts_for_attendance,calendar_note=EXCLUDED.calendar_note
  `,
    [section, JSON.stringify(days)],
  );
}
async function putExceptions(db: DB, a: Actor, section: string, days: Day[]) {
  if (!days.length) return;
  await db.query(
    `
    INSERT INTO section_calendar_exceptions(section_id,school_date,is_instructional,counts_for_attendance,note,updated_by)
    SELECT $1,x.day::date,x.instructional,x.counts,x.note,$3
    FROM jsonb_to_recordset($2::jsonb) AS x(day text,instructional boolean,counts boolean,note text)
    ON CONFLICT(section_id,school_date) DO UPDATE SET is_instructional=EXCLUDED.is_instructional,
      counts_for_attendance=EXCLUDED.counts_for_attendance,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by
  `,
    [section, JSON.stringify(days), a.id],
  );
}
async function replacePattern(
  db: DB,
  a: Actor,
  section: string,
  change: Extract<CalendarChange, { kind: "WEEKLY" }>,
  old: CalendarPattern[],
) {
  await db.query(
    "DELETE FROM section_calendar_patterns WHERE section_id=$1 AND starts_on<=$3 AND ends_on>=$2",
    [section, change.from, change.through],
  );
  const fragments = old.flatMap((p) => [
    ...(p.starts_on < change.from
      ? [
          {
            from: p.starts_on,
            through: shift(change.from, -1),
            weekdays: p.weekdays,
          },
        ]
      : []),
    ...(p.ends_on > change.through
      ? [
          {
            from: shift(change.through, 1),
            through: p.ends_on,
            weekdays: p.weekdays,
          },
        ]
      : []),
  ]);
  for (const p of [
    ...fragments,
    {
      from: change.from,
      through: change.through,
      weekdays: [...change.weekdays].sort(),
    },
  ]) {
    await db.query(
      "INSERT INTO section_calendar_patterns(section_id,starts_on,ends_on,weekdays,updated_by) VALUES($1,$2,$3,$4,$5)",
      [section, p.from, p.through, p.weekdays, a.id],
    );
  }
}
async function commitPlan(
  db: DB,
  a: Actor,
  change: CalendarChange,
  prepared: Awaited<ReturnType<typeof plan>>["prepared"],
) {
  for (const p of prepared) {
    if (change.kind === "WEEKLY")
      await replacePattern(db, a, p.section.id, change, p.old.patterns);
    else if (change.kind === "EXCEPTION")
      await putExceptions(db, a, p.section.id, p.next);
    else
      await db.query(
        "DELETE FROM section_calendar_exceptions WHERE section_id=$1 AND school_date BETWEEN $2 AND $3",
        [p.section.id, change.from, change.through],
      );
    await materialize(db, p.section.id, p.next);
    await db.query(
      "UPDATE sections SET calendar_version=calendar_version+1 WHERE id=$1",
      [p.section.id],
    );
    await audit(
      db,
      a,
      `CALENDAR_${change.kind}`,
      "sections",
      p.section.id,
      p.old,
      { change, summary: p.summary, days: p.next },
      change.reason,
    );
  }
}
// Older web/mobile endpoints participate in the same locks, versions and overrides.
export async function legacyCalendarDays(
  db: DB,
  a: Actor,
  section: string,
  input: {
    schoolDate: string;
    isInstructional: boolean;
    countsForAttendance: boolean;
    note: string;
  }[],
) {
  const sorted = input.map((d) => d.schoolDate).sort();
  check(new Set(sorted).size === sorted.length, "Duplicate calendar dates");
  await lockSections(db, a, [section], sorted[0], sorted[sorted.length - 1]);
  const days = input.map((d) => ({
    day: d.schoolDate,
    instructional: d.isInstructional,
    counts: d.countsForAttendance,
    note: d.note || (d.isInstructional ? "Extra teaching day" : "Holiday"),
  }));
  await putExceptions(db, a, section, days);
  await materialize(db, section, days);
  await db.query(
    "UPDATE sections SET calendar_version=calendar_version+1 WHERE id=$1",
    [section],
  );
  await audit(db, a, "CALENDAR", "sections", section, null, input);
  return { ok: true };
}
export async function legacyCalendarRange(
  db: DB,
  a: Actor,
  section: string,
  input: {
    from: string;
    through: string;
    weekdays: number[];
    holidays: { date: string; note: string }[];
  },
) {
  await lockSections(db, a, [section], input.from, input.through);
  check(
    input.holidays.every(
      (h) => h.date >= input.from && h.date <= input.through,
    ),
    "Holiday dates must be inside the selected range",
  );
  await putExceptions(
    db,
    a,
    section,
    input.holidays.map((h) => ({
      day: h.date,
      instructional: false,
      counts: false,
      note: h.note,
    })),
  );
  const change: CalendarChange = {
    sectionIds: [section],
    from: input.from,
    through: input.through,
    weekdays: input.weekdays,
    kind: "WEEKLY",
    reason: "Weekly calendar saved from attendance setup",
  };
  const prepared = await plan(db, a, change);
  await commitPlan(db, a, change, prepared.prepared);
  return { days: dates(input.from, input.through).length };
}
export function calendars(app: FastifyInstance) {
  app.get("/v1/calendars", async (req) => {
    const a = await actor(req);
    const managed = (await capabilities(pool, a)).managedSections;
    check(
      a.admin || managed.length,
      "Calendar management access required",
      403,
    );
    return (
      await pool.query(
        `
      SELECT s.id,s.name,s.code,s.academic_year_id,s.program_id,s.level_id,s.calendar_version,
        y.label AS year_label,y.state AS year_state,y.start_date::text AS year_start,y.end_date::text AS year_end,
        p.name AS program_name,l.name_en AS level_name,
        (SELECT count(*)::int FROM section_calendar_days c WHERE c.section_id=s.id) AS configured_days,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'starts_on',r.starts_on::text,'ends_on',r.ends_on::text,'weekdays',r.weekdays) ORDER BY r.starts_on) FROM section_calendar_patterns r WHERE r.section_id=s.id),'[]'::jsonb) AS patterns
      FROM sections s JOIN academic_years y ON y.id=s.academic_year_id
      JOIN programs p ON p.id=s.program_id JOIN levels l ON l.id=s.level_id
      WHERE s.organization_id=$1 AND ($2 OR s.id=ANY($3::uuid[]))
      ORDER BY y.start_date DESC,p.name,l.ordinal,s.code
    `,
        [a.org, a.admin, managed],
      )
    ).rows;
  });
  app.get("/v1/sections/:id/academic-calendar", async (req) => {
    const a = await actor(req),
      section = uuid.parse((req.params as any).id);
    await scope(pool, a, section, "attendanceRead");
    check(
      a.admin ||
        (await capabilities(pool, a)).managedSections.includes(section),
      "Calendar management access required",
      403,
    );
    const q = z
      .object({ from: schoolDate, through: schoolDate })
      .parse(req.query);
    check(
      q.from <= q.through &&
        (Date.parse(q.through) - Date.parse(q.from)) / 86400000 < 366,
      "View at most one year of calendar dates",
    );
    // A single snapshot keeps the displayed version and days consistent.
    return transaction(async (db) => {
      const version = (
        await db.query(
          "SELECT calendar_version FROM sections WHERE id=$1 FOR SHARE",
          [section],
        )
      ).rows[0].calendar_version;
      const data = await rowsFor(db, section, q.from, q.through);
      const dayMap = new Map(data.days.map((d) => [d.day, d]));
      const exceptionMap = new Map(data.exceptions.map((d) => [d.day, d]));
      return {
        version,
        patterns: data.patterns,
        days: dates(q.from, q.through).map((date) => {
          const day = dayMap.get(date);
          return {
            date,
            isInstructional: day?.instructional ?? false,
            countsForAttendance: day?.counts ?? false,
            note: day?.note ?? "Calendar not configured",
            sheetState: day?.sheet_state ?? null,
            source: exceptionMap.has(date)
              ? "EXCEPTION"
              : data.patterns.some(
                    (p) => p.starts_on <= date && p.ends_on >= date,
                  )
                ? "WEEKLY"
                : day
                  ? "EXISTING"
                  : "UNCONFIGURED",
          };
        }),
      };
    });
  });
  app.post("/v1/calendars/preview", async (req) => {
    const a = await actor(req),
      change = calendarChangeSchema.parse(req.body);
    return transaction(async (db) => (await plan(db, a, change)).preview);
  });
  app.post("/v1/calendars/apply", async (req) => {
    const a = await actor(req),
      input = calendarApplySchema.parse(req.body);
    const change = calendarChangeSchema.parse(input);
    return transaction(async (db) => {
      const prepared = await plan(db, a, change);
      check(
        input.previewHash === prepared.preview.hash,
        "Calendar changed since preview; preview again before saving",
        409,
      );
      check(
        input.acknowledgeRecordedChanges ||
          !prepared.preview.sections.some((s) => s.recordedDatesAffected > 0),
        "Confirm the effect on dates with saved attendance before applying",
        409,
      );
      await commitPlan(db, a, change, prepared.prepared);
      return { ok: true, sections: prepared.preview.sections.length };
    });
  });
}
