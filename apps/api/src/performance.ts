import type { FastifyInstance } from "fastify";
import { z } from "zod";
import Decimal from "decimal.js";
import { spawn } from "node:child_process";
import { pool, transaction, type DB } from "./db.ts";
import { actor, check, scope, manage, audit, type Actor } from "./security.ts";
import {
  uuid,
  schoolDate,
  calculate,
  positionEligibility,
  policySchema,
  institutePolicy,
  instituteAttendance,
  csvCell,
  type Mark,
} from "../../../packages/domain/src/index.ts";
import { loadScheme } from "./exams.ts";
const periodQuery = z.object({
  period: z.enum(["YEAR", "SESSION", "PREVIOUS_SESSION"]).default("YEAR"),
  cycleId: uuid.optional(),
});
export async function attendanceRange(
  db: DB,
  section: string,
  today: string,
  query: z.infer<typeof periodQuery>,
) {
  const year = (
    await db.query(
      "SELECT y.id,y.label,y.start_date::text AS start,y.end_date::text AS finish FROM academic_years y JOIN sections s ON s.academic_year_id=y.id WHERE s.id=$1",
      [section],
    )
  ).rows[0];
  check(year, "Section unavailable", 404);
  let from = year.start,
    through = year.finish,
    label = year.label;
  if (query.period !== "YEAR") {
    check(query.cycleId, "Select an exam session");
    let cycle = (
      await db.query(
        "SELECT * FROM exam_cycles WHERE id=$1 AND academic_year_id=$2",
        [query.cycleId, year.id],
      )
    ).rows[0];
    check(cycle, "Session does not belong to this class year");
    if (query.period === "PREVIOUS_SESSION") {
      cycle = (
        await db.query(
          "SELECT * FROM exam_cycles WHERE academic_year_id=$1 AND sort_order<$2 ORDER BY sort_order DESC LIMIT 1",
          [year.id, cycle.sort_order],
        )
      ).rows[0];
      check(cycle, "There is no previous exam session");
    }
    const window = (
      await db.query(
        "SELECT attendance_from::text AS start,attendance_through::text AS finish FROM exam_section_settings WHERE exam_cycle_id=$1 AND section_id=$2",
        [cycle.id, section],
      )
    ).rows[0];
    check(window, "Configure this session attendance window first");
    from = window.start;
    through = window.finish;
    label = cycle.title;
  }
  return {
    from,
    through: through < today ? through : today,
    label,
    yearId: year.id,
    period: query.period,
  };
}
export async function attendanceSummary(
  db: DB,
  section: string,
  from: string,
  through: string,
) {
  const rows = (
    await db.query(
      `SELECT e.id AS "enrollmentId",e.student_id AS "studentId",e.roll_number AS roll,s.student_number AS "studentNumber",s.full_name AS name,
 count(c.id)::int AS "academicDays",
 count(r.id) FILTER(WHERE r.status='PRESENT')::int AS present,
 count(r.id) FILTER(WHERE r.status='ABSENT')::int AS absent,
 count(r.id) FILTER(WHERE r.status='HALF')::int AS half,
 count(r.id) FILTER(WHERE r.status='LEAVE')::int AS leave,
 count(r.id) FILTER(WHERE r.status='LATE')::int AS "legacyLate",
 count(c.id) FILTER(WHERE r.id IS NULL)::int AS unmarked,
 count(c.id) FILTER(WHERE sh.state='DRAFT')::int AS "draftDays"
 FROM enrollments e JOIN students s ON s.id=e.student_id
 LEFT JOIN section_calendar_days c ON c.section_id=e.section_id AND c.is_instructional AND c.counts_for_attendance AND c.school_date BETWEEN $2::date AND $3::date AND c.school_date>=e.joined_on AND (e.left_on IS NULL OR c.school_date<=e.left_on)
 LEFT JOIN attendance_sheets sh ON sh.section_id=e.section_id AND sh.school_date=c.school_date
 LEFT JOIN attendance_records r ON r.sheet_id=sh.id AND r.enrollment_id=e.id AND sh.state IN ('SUBMITTED','LOCKED')
 WHERE e.section_id=$1 AND e.joined_on<=$3::date AND (e.left_on IS NULL OR e.left_on>=$2::date) GROUP BY e.id,s.id ORDER BY e.roll_number`,
      [section, from, through],
    )
  ).rows;
  return rows.map((r) => {
    const possible = r.academicDays - r.leave,
      earned = r.present + r.half * 0.5,
      recordedPossible = possible - r.unmarked - r.legacyLate;
    const complete = r.unmarked === 0 && r.legacyLate === 0;
    return {
      ...r,
      earned,
      possible,
      complete,
      percent:
        complete && possible > 0
          ? new Decimal(earned).div(possible).mul(100).toString()
          : null,
      displayPercent:
        complete && possible > 0
          ? new Decimal(earned).div(possible).mul(100).toFixed(1)
          : null,
      recordedPercent:
        recordedPossible > 0
          ? new Decimal(earned).div(recordedPossible).mul(100).toFixed(1)
          : null,
    };
  });
}
async function studentAccess(db: DB, a: Actor, student: string) {
  check(
    (
      await db.query(
        "SELECT 1 FROM students WHERE id=$1 AND organization_id=$2",
        [student, a.org],
      )
    ).rowCount,
    "Student unavailable",
    404,
  );
  if (a.admin) return;
  const r = await db.query(
    `SELECT 1 FROM enrollments e JOIN section_staff_assignments t ON t.section_id=e.section_id WHERE e.student_id=$1 AND t.user_id=$2 AND t.active AND t.role IN ('MUSHRIF','CLASS_TEACHER') AND t.starts_on<=$3::date AND (t.ends_on IS NULL OR t.ends_on>=$3::date)`,
    [student, a.id, a.today],
  );
  check(r.rowCount, "Student performance access denied", 403);
}
export async function studentPerformance(
  db: DB,
  a: Actor,
  student: string,
  filter: { yearId?: string; cycleId?: string } = {},
) {
  await studentAccess(db, a, student);
  const person = (
    await db.query(
      "SELECT id,student_number,full_name,full_name_ur FROM students WHERE id=$1",
      [student],
    )
  ).rows[0];
  const enrollments = (
    await db.query(
      `SELECT e.*,e.joined_on::text AS joined_date,e.left_on::text AS left_date,s.name AS section_name,s.code AS section_code,y.label AS year_label,y.id AS year_id,y.start_date::text AS year_start,y.end_date::text AS year_end,l.name_ur AS level_name,p.name AS program_name FROM enrollments e JOIN sections s ON s.id=e.section_id JOIN academic_years y ON y.id=s.academic_year_id JOIN levels l ON l.id=s.level_id JOIN programs p ON p.id=s.program_id WHERE e.student_id=$1 AND ($2::uuid IS NULL OR y.id=$2) ORDER BY y.start_date,e.joined_on`,
      [student, filter.yearId ?? null],
    )
  ).rows;
  const config =
    (
      await db.query(
        "SELECT config FROM organization_settings WHERE organization_id=$1",
        [a.org],
      )
    ).rows[0]?.config ?? {};
  const approved = policySchema.safeParse(config.approvedPolicy),
    policy = approved.success ? approved.data : institutePolicy;
  const years: {
    enrollmentId: string;
    sectionId: string;
    section: string;
    level: string | null;
    program: string;
    yearId: string;
    year: string;
    joinedOn: string;
    leftOn: string | null;
    attendance: Awaited<ReturnType<typeof attendanceSummary>>[number] | null;
    sessions: any[];
    combined: {
      total: number;
      possible: number;
      complete: boolean;
      percent: string | null;
    };
  }[] = [];
  for (const e of enrollments) {
    const annual =
      (
        await attendanceSummary(
          db,
          e.section_id,
          e.year_start,
          e.year_end < a.today ? e.year_end : a.today,
        )
      ).find((x) => x.enrollmentId === e.id) ?? null;
    const cycles = (
      await db.query(
        "SELECT c.id,c.title,c.code,c.sort_order,w.attendance_from::text AS start,w.attendance_through::text AS finish FROM exam_cycles c LEFT JOIN exam_section_settings w ON w.exam_cycle_id=c.id AND w.section_id=$3 WHERE c.academic_year_id=$1 AND ($2::uuid IS NULL OR c.id=$2) ORDER BY c.sort_order",
        [e.year_id, filter.cycleId ?? null, e.section_id],
      )
    ).rows;
    const sessions = [];
    for (const cycle of cycles) {
      if (
        cycle.finish &&
        (e.joined_date > cycle.finish ||
          (e.left_date && e.left_date < cycle.start))
      )
        continue;
      const published = (
        await db.query(
          "SELECT id,revision,published_at,document_snapshot FROM result_runs WHERE section_id=$1 AND exam_cycle_id=$2 AND state='PUBLISHED'",
          [e.section_id, cycle.id],
        )
      ).rows[0];
      const frozen = published?.document_snapshot?.students.find(
        (s: any) => s.enrollmentId === e.id,
      );
      const scheme = frozen
        ? published.document_snapshot.scheme
        : await loadScheme(db, cycle.id, e.section_id);
      const marksRows = (
        await db.query(
          "SELECT p.paper_code,m.* FROM exam_assessments p JOIN section_subjects o ON o.id=p.section_subject_id LEFT JOIN marks m ON m.assessment_id=p.id AND m.enrollment_id=$3 WHERE o.section_id=$1 AND p.exam_cycle_id=$2 AND p.exam_scheme_revision=current_scheme_revision($2,$1)",
          [e.section_id, cycle.id, e.id],
        )
      ).rows;
      const marks: Record<string, Mark> =
        frozen?.marks ??
        Object.fromEntries(
          marksRows.map((m) => [
            m.paper_code,
            {
              state: m.entry_state ?? "PENDING",
              awarded: m.awarded == null ? null : Number(m.awarded),
              onLeave: m.on_leave ?? false,
              onTime: m.on_time ?? null,
            },
          ]),
        );
      const result =
        frozen ??
        (scheme.papers.length
          ? calculate(scheme, marks, policy)
          : {
              total: 0,
              possible: 0,
              percent: null,
              passing: false,
              errors: ["Session scheme not configured"],
              groups: [],
            });
      let attendance: any = null;
      try {
        const w = await attendanceRange(db, e.section_id, a.today, {
          period: "SESSION",
          cycleId: cycle.id,
        });
        attendance =
          (await attendanceSummary(db, e.section_id, w.from, w.through)).find(
            (x) => x.enrollmentId === e.id,
          ) ?? null;
      } catch {
        /* explicitly unconfigured window */
      }
      if (frozen?.attendance) {
        const att = frozen.attendance;
        attendance = {
          academicDays:
            att.present == null
              ? null
              : att.present + att.absent + att.half + att.leave,
          present: att.present ?? null,
          absent: att.absent ?? null,
          half: att.half ?? null,
          leave: att.leave ?? null,
          unmarked: 0,
          displayPercent: att.displayPercent ?? att.percent,
          source: "PUBLISHED_SNAPSHOT",
        };
      }
      const timely =
        positionEligibility(scheme, marks) && scheme.papers.length > 0;
      sessions.push({
        cycleId: cycle.id,
        title: cycle.title,
        scheme,
        marks,
        result,
        attendance,
        complete:
          scheme.papers.length > 0 &&
          (!result.errors || result.errors.length === 0),
        official: !!frozen,
        publication: frozen
          ? {
              id: published.id,
              revision: published.revision,
              publishedAt: published.published_at,
            }
          : null,
        positionEligible: frozen
          ? typeof frozen.onTimeEligible === "boolean"
            ? frozen.onTimeEligible &&
              result.percent !== null &&
              new Decimal(result.percent).gt(80)
            : null
          : timely &&
            result.percent !== null &&
            new Decimal(result.percent).gt(80),
        positionReason: frozen
          ? (frozen.positionReason ??
            (frozen.onTimeEligible == null
              ? "Eligibility preserved under the original published policy"
              : null))
          : !timely
            ? "Every paper must be graded on time without exam leave"
            : result.percent === null || new Decimal(result.percent).lte(80)
              ? "More than 80% is required"
              : null,
      });
    }
    const total = sessions.reduce(
        (v, x) => v.plus(x.result.total),
        new Decimal(0),
      ),
      possible = sessions.reduce(
        (v, x) => v.plus(x.result.possible),
        new Decimal(0),
      );
    const complete = sessions.length > 0 && sessions.every((x) => x.complete);
    years.push({
      enrollmentId: e.id,
      sectionId: e.section_id,
      section: e.section_name,
      level: e.level_name,
      program: e.program_name,
      yearId: e.year_id,
      year: e.year_label,
      joinedOn: e.joined_on,
      leftOn: e.left_on,
      attendance: annual,
      sessions,
      combined: {
        total: total.toNumber(),
        possible: possible.toNumber(),
        complete,
        percent:
          complete && possible.gt(0)
            ? total.div(possible).mul(100).toFixed(1)
            : null,
      },
    });
  }
  const academicYears = [...new Set(years.map((y) => y.yearId))].map(
    (yearId) => {
      const own = years.filter((y) => y.yearId === yearId),
        attendance: any = {
          academicDays: 0,
          present: 0,
          absent: 0,
          half: 0,
          leave: 0,
          unmarked: 0,
          legacyLate: 0,
        };
      for (const y of own)
        if (y.attendance)
          for (const key of Object.keys(attendance))
            attendance[key] += y.attendance[key] ?? 0;
      attendance.possible = attendance.academicDays - attendance.leave;
      attendance.earned = attendance.present + attendance.half * 0.5;
      attendance.complete =
        attendance.unmarked === 0 && attendance.legacyLate === 0;
      attendance.displayPercent =
        attendance.complete && attendance.possible > 0
          ? new Decimal(attendance.earned)
              .div(attendance.possible)
              .mul(100)
              .toFixed(1)
          : null;
      const total = own.reduce(
          (v, y) => v.plus(y.combined.total),
          new Decimal(0),
        ),
        possible = own.reduce(
          (v, y) => v.plus(y.combined.possible),
          new Decimal(0),
        ),
        complete = own.every((y) => y.combined.complete);
      return {
        yearId,
        year: own[0].year,
        attendance,
        combined: {
          total: total.toNumber(),
          possible: possible.toNumber(),
          complete,
          percent:
            complete && possible.gt(0)
              ? total.div(possible).mul(100).toFixed(1)
              : null,
        },
      };
    },
  );
  return {
    academicYears,
    student: person,
    years,
    asOf: a.today,
    note: "Attendance uses submitted academic days only; missing days remain unmarked. Combined marks sum the displayed sessions; no annual grade or position is inferred.",
  };
}
async function performancePDF(data: unknown) {
  return new Promise<Buffer>((resolve, reject) => {
    const p = spawn(
        process.env.PDF_PYTHON ?? "python3",
        ["scripts/render_performance.py"],
        {
          env: {
            ...process.env,
            XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? "/tmp/hikmah-cache",
          },
        },
      ),
      parts: Buffer[] = [];
    let error = "";
    p.stdout.on("data", (b) => parts.push(b));
    p.stderr.on("data", (b) => {
      error += b.toString();
    });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(parts))
        : reject(new Error("Performance PDF: " + error)),
    );
    p.stdin.end(JSON.stringify(data));
  });
}
export function performance(app: FastifyInstance) {
  app.get("/v1/sections/:section/attendance-periods", async (req) => {
    const a = await actor(req),
      section = uuid.parse((req.params as any).section);
    await scope(pool, a, section, "attendanceRead");
    return (
      await pool.query(
        "SELECT c.id,c.title,c.code,c.sort_order,w.attendance_from,w.attendance_through FROM exam_cycles c JOIN sections s ON s.academic_year_id=c.academic_year_id LEFT JOIN exam_section_settings w ON w.exam_cycle_id=c.id AND w.section_id=s.id WHERE s.id=$1 ORDER BY c.sort_order",
        [section],
      )
    ).rows;
  });
  app.get("/v1/sections/:section/attendance-summary", async (req) => {
    const a = await actor(req),
      section = uuid.parse((req.params as any).section);
    await scope(pool, a, section, "attendanceRead");
    const q = periodQuery.parse(req.query);
    return transaction(async (db) => {
      const window = await attendanceRange(db, section, a.today, q);
      return {
        window,
        students: await attendanceSummary(
          db,
          section,
          window.from,
          window.through,
        ),
        rules: instituteAttendance,
      };
    });
  });
  app.put("/v1/sections/:section/calendar/range", async (req) => {
    const a = await actor(req),
      section = uuid.parse((req.params as any).section);
    const d = z
      .object({
        from: schoolDate,
        through: schoolDate,
        weekdays: z.array(z.number().int().min(0).max(6)).min(1),
        holidays: z
          .array(
            z.object({ date: schoolDate, note: z.string().min(1).max(200) }),
          )
          .max(366)
          .default([]),
      })
      .parse(req.body);
    check(
      d.from <= d.through &&
        (Date.parse(d.through) - Date.parse(d.from)) / 86400000 < 1100,
      "Choose a valid calendar range of at most three years",
    );
    return transaction(async (db) => {
      await manage(db, a, section);
      const y = (
        await db.query(
          "SELECT y.start_date::text,y.end_date::text FROM academic_years y JOIN sections s ON s.academic_year_id=y.id WHERE s.id=$1",
          [section],
        )
      ).rows[0];
      check(
        d.from >= y.start_date && d.through <= y.end_date,
        "Calendar range must be inside the academic year",
      );
      let count = 0;
      for (
        let day = Date.parse(d.from);
        day <= Date.parse(d.through);
        day += 86400000
      ) {
        const date = new Date(day),
          iso = date.toISOString().slice(0, 10),
          holiday = d.holidays.find((h) => h.date === iso),
          academic = d.weekdays.includes(date.getUTCDay()) && !holiday;
        await db.query(
          "INSERT INTO section_calendar_days(section_id,school_date,is_instructional,counts_for_attendance,calendar_note) VALUES($1,$2,$3,$3,$4) ON CONFLICT(section_id,school_date) DO UPDATE SET is_instructional=$3,counts_for_attendance=$3,calendar_note=$4",
          [
            section,
            iso,
            academic,
            holiday?.note ?? (academic ? "Academic day" : "Non-academic day"),
          ],
        );
        count++;
      }
      await audit(db, a, "CALENDAR_RANGE", "sections", section, null, d);
      return { days: count };
    });
  });
  app.get("/v1/students/:student/performance", async (req) => {
    const a = await actor(req),
      student = uuid.parse((req.params as any).student),
      q = z
        .object({ yearId: uuid.optional(), cycleId: uuid.optional() })
        .parse(req.query);
    return transaction((db) => studentPerformance(db, a, student, q));
  });
  app.get("/v1/students/:student/performance.pdf", async (req, reply) => {
    const a = await actor(req),
      student = uuid.parse((req.params as any).student),
      q = z
        .object({ yearId: uuid.optional(), cycleId: uuid.optional() })
        .parse(req.query);
    const data = await transaction((db) =>
      studentPerformance(db, a, student, q),
    );
    await audit(pool, a, "EXPORT_PERFORMANCE", "students", student, null, q);
    return reply
      .type("application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="student-performance.pdf"',
      )
      .send(await performancePDF({ students: [data] }));
  });
  for (const extension of ["", ".pdf", ".csv"])
    app.get(
      "/v1/sections/:section/performance" + extension,
      async (req, reply) => {
        const a = await actor(req),
          section = uuid.parse((req.params as any).section),
          q = z.object({ cycleId: uuid.optional() }).parse(req.query);
        await scope(pool, a, section, "results");
        const data = await transaction(async (db) => {
          const own = (
            await db.query("SELECT * FROM sections WHERE id=$1", [section])
          ).rows[0];
          const roster = (
            await db.query(
              "SELECT DISTINCT student_id FROM enrollments WHERE section_id=$1 ORDER BY student_id",
              [section],
            )
          ).rows;
          const students = [];
          for (const r of roster) {
            const report = await studentPerformance(db, a, r.student_id, {
              yearId: own.academic_year_id,
              cycleId: q.cycleId,
            });
            report.years = report.years.filter((y) => y.sectionId === section);
            students.push(report);
          }
          return { students };
        });
        if (!extension) return data;
        await audit(
          pool,
          a,
          "EXPORT_CLASS_PERFORMANCE",
          "sections",
          section,
          null,
          { ...q, format: extension },
        );
        if (extension === ".pdf")
          return reply
            .type("application/pdf")
            .header(
              "Content-Disposition",
              'attachment; filename="class-performance.pdf"',
            )
            .send(await performancePDF(data));
        const rows = data.students.flatMap((s) =>
          s.years.flatMap((y) =>
            y.sessions.map((x) =>
              [
                s.student.student_number,
                s.student.full_name,
                y.year,
                y.section,
                x.title,
                x.result.total,
                x.result.possible,
                x.result.percent,
                x.result.passing,
                x.result.rank,
                x.attendance?.present,
                x.attendance?.absent,
                x.attendance?.half,
                x.attendance?.leave,
                x.attendance?.displayPercent,
                x.official ? "PUBLISHED" : "DRAFT",
              ]
                .map(csvCell)
                .join(","),
            ),
          ),
        );
        return reply
          .type("text/csv; charset=utf-8")
          .header(
            "Content-Disposition",
            'attachment; filename="class-performance.csv"',
          )
          .send(
            "\uFEFF" +
              [
                "student_number,name,year,section,session,total,possible,percent,passing,position,present,absent,half,leave,attendance_percent,status",
                ...rows,
              ].join("\r\n"),
          );
      },
    );
}
