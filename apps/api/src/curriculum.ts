import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, transaction } from "./db.ts";
import { actor, manage, check, audit } from "./security.ts";
import {
  schemeSchema,
  uuid,
  schoolDate,
} from "../../../packages/domain/src/index.ts";
import { saveScheme, loadScheme } from "./exams.ts";
export function curricula(app: FastifyInstance) {
  app.get("/v1/sections/:section/curriculum", async (req) => {
    const a = await actor(req),
      section = uuid.parse((req.params as any).section);
    await manage(pool, a, section);
    return (
      (
        await pool.query(
          "SELECT * FROM section_curricula WHERE section_id=$1",
          [section],
        )
      ).rows[0] ?? { section_id: section, version: 0, scheme: null }
    );
  });
  app.put("/v1/sections/:section/curriculum", async (req) => {
    const a = await actor(req),
      section = uuid.parse((req.params as any).section);
    const d = z
      .object({ scheme: schemeSchema, version: z.number().int().nonnegative() })
      .parse(req.body);
    return transaction(async (db) => {
      await manage(db, a, section);
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        section + "curriculum",
      ]);
      const old = (
        await db.query(
          "SELECT * FROM section_curricula WHERE section_id=$1 FOR UPDATE",
          [section],
        )
      ).rows[0];
      check(
        (old?.version ?? 0) === d.version,
        "Curriculum changed; refresh",
        409,
      );
      for (const p of d.scheme.papers)
        check(
          (
            await db.query(
              "SELECT 1 FROM section_subjects WHERE id=$1 AND section_id=$2",
              [p.offeringId, section],
            )
          ).rowCount,
          "Offering must belong to this class",
        );
      const r = (
        await db.query(
          "INSERT INTO section_curricula(section_id,scheme,updated_by) VALUES($1,$2,$3) ON CONFLICT(section_id) DO UPDATE SET scheme=$2,version=section_curricula.version+1,updated_by=$3,updated_at=now() RETURNING *",
          [
            section,
            JSON.stringify({
              ...d.scheme,
              papers: d.scheme.papers.map((p) => ({ ...p, date: null })),
            }),
            a.id,
          ],
        )
      ).rows[0];
      await audit(db, a, "CURRICULUM", "sections", section, old ?? null, r);
      return r;
    });
  });
  app.post(
    "/v1/exam-cycles/:cycle/sections/:section/from-curriculum",
    async (req) => {
      const a = await actor(req),
        section = uuid.parse((req.params as any).section),
        cycle = uuid.parse((req.params as any).cycle);
      return transaction(async (db) => {
        await manage(db, a, section);
        const row = (
          await db.query(
            "SELECT scheme FROM section_curricula WHERE section_id=$1",
            [section],
          )
        ).rows[0];
        check(row, "Save the class curriculum first");
        await saveScheme(db, a, cycle, section, schemeSchema.parse(row.scheme));
        return { ok: true };
      });
    },
  );
  app.post(
    "/v1/sections/:section/curriculum/from-session/:cycle",
    async (req) => {
      const a = await actor(req),
        section = uuid.parse((req.params as any).section),
        cycle = uuid.parse((req.params as any).cycle);
      return transaction(async (db) => {
        await manage(db, a, section);
        const scheme = schemeSchema.parse(await loadScheme(db, cycle, section));
        check(
          !(
            await db.query(
              "SELECT 1 FROM section_curricula WHERE section_id=$1",
              [section],
            )
          ).rowCount,
          "A class curriculum already exists; use its editor",
          409,
        );
        const row = (
          await db.query(
            "INSERT INTO section_curricula(section_id,scheme,updated_by) VALUES($1,$2,$3) RETURNING *",
            [
              section,
              JSON.stringify({
                ...scheme,
                papers: scheme.papers.map((p) => ({ ...p, date: null })),
              }),
              a.id,
            ],
          )
        ).rows[0];
        await audit(
          db,
          a,
          "CURRICULUM_FROM_SESSION",
          "sections",
          section,
          null,
          row,
        );
        return row;
      });
    },
  );
  app.post("/v1/sections/:section/subject-catalog", async (req) => {
    const a = await actor(req),
      section = uuid.parse((req.params as any).section);
    const d = z
      .object({
        code: z.string().min(1).max(32),
        name: z.string().min(1).max(150),
      })
      .parse(req.body);
    return transaction(async (db) => {
      await manage(db, a, section);
      const subject = (
        await db.query(
          "INSERT INTO subjects(organization_id,code,name_en,name_ur) VALUES($1,$2,$3,$3) ON CONFLICT(organization_id,code) DO UPDATE SET code=subjects.code RETURNING id",
          [a.org, d.code, d.name],
        )
      ).rows[0];
      const offering = (
        await db.query(
          "INSERT INTO section_subjects(section_id,subject_id) VALUES($1,$2) ON CONFLICT(section_id,subject_id) DO UPDATE SET active=true RETURNING *",
          [section, subject.id],
        )
      ).rows[0];
      await audit(
        db,
        a,
        "CLASS_SUBJECT",
        "section_subjects",
        offering.id,
        null,
        d,
      );
      return offering;
    });
  });
  app.put("/v1/assessments/:id/schedule", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id),
      d = z.object({ date: schoolDate }).parse(req.body);
    return transaction(async (db) => {
      const p = (
        await db.query(
          "SELECT o.section_id,y.start_date::text,y.end_date::text FROM exam_assessments p JOIN section_subjects o ON o.id=p.section_subject_id JOIN sections s ON s.id=o.section_id JOIN academic_years y ON y.id=s.academic_year_id WHERE p.id=$1",
          [id],
        )
      ).rows[0];
      check(p, "Paper unavailable", 404);
      await manage(db, a, p.section_id);
      check(
        d.date >= p.start_date && d.date <= p.end_date,
        "Schedule date must be inside the academic year",
      );
      await db.query(
        "DELETE FROM exam_schedule_entries WHERE assessment_id=$1",
        [id],
      );
      await db.query(
        "INSERT INTO exam_schedule_entries(assessment_id,exam_date) VALUES($1,$2)",
        [id, d.date],
      );
      await audit(db, a, "SCHEDULE", "exam_assessments", id, null, d);
      return { ok: true };
    });
  });
}
