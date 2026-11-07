import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { transaction } from "./db.ts";
import { actor, admin, scope, check, audit } from "./security.ts";
import { schemeSchema, uuid } from "../../../packages/domain/src/index.ts";
export function schemeRevisions(app: FastifyInstance) {
  app.post(
    "/v1/exam-cycles/:cycle/sections/:section/scheme/revise",
    async (req) => {
      const a = await actor(req);
      admin(a);
      const cycle = uuid.parse((req.params as any).cycle),
        section = uuid.parse((req.params as any).section);
      const d = z
        .object({
          scheme: schemeSchema,
          reason: z.string().min(5).max(1000),
          copyMarks: z.boolean(),
        })
        .parse(req.body);
      return transaction(async (db) => {
        await scope(db, a, section, "results");
        const setting = (
          await db.query(
            "SELECT * FROM exam_section_settings WHERE exam_cycle_id=$1 AND section_id=$2 FOR UPDATE",
            [cycle, section],
          )
        ).rows[0];
        check(setting, "Configure section windows before revising a scheme");
        const old = (
          await db.query(
            "SELECT * FROM exam_scheme_approvals WHERE exam_cycle_id=$1 AND section_id=$2 AND state='APPROVED'",
            [cycle, section],
          )
        ).rows[0];
        check(
          old,
          "Approve the current scheme before creating its next revision",
        );
        const revision = setting.active_scheme_revision + 1;
        await db.query(
          "UPDATE exam_scheme_approvals SET state='SUPERSEDED' WHERE id=$1",
          [old.id],
        );
        await db.query(
          "UPDATE exam_assessments SET state='LOCKED' WHERE exam_cycle_id=$1 AND exam_scheme_revision=$3 AND section_subject_id IN(SELECT id FROM section_subjects WHERE section_id=$2)",
          [cycle, section, setting.active_scheme_revision],
        );
        await db.query(
          "UPDATE exam_section_settings SET active_scheme_revision=$3 WHERE exam_cycle_id=$1 AND section_id=$2",
          [cycle, section, revision],
        );
        const ids = new Map<string, string>();
        for (const [i, p] of d.scheme.papers.entries()) {
          const valid = await db.query(
            "SELECT 1 FROM section_subjects WHERE id=$1 AND section_id=$2",
            [p.offeringId, section],
          );
          check(valid.rowCount, "Offering must belong to section");
          const paper = (
            await db.query(
              "INSERT INTO exam_assessments(exam_cycle_id,section_subject_id,title,display_label_ur,paper_code,max_marks,assessment_type,question_pattern,display_order,exam_scheme_revision) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
              [
                cycle,
                p.offeringId,
                p.label,
                p.code,
                p.max,
                p.type,
                p.pattern,
                i,
                revision,
              ],
            )
          ).rows[0];
          ids.set(p.code, paper.id);
          if (p.date)
            await db.query(
              "INSERT INTO exam_schedule_entries(assessment_id,exam_date) VALUES($1,$2)",
              [paper.id, p.date],
            );
          if (d.copyMarks)
            await db.query(
              `INSERT INTO marks(assessment_id,enrollment_id,entry_state,awarded,entered_by,entered_at,change_reason) SELECT $1,m.enrollment_id,m.entry_state,m.awarded,$2,now(),$3 FROM marks m JOIN exam_assessments p ON p.id=m.assessment_id JOIN section_subjects o ON o.id=p.section_subject_id WHERE p.exam_cycle_id=$4 AND o.section_id=$5 AND p.exam_scheme_revision=$6 AND p.paper_code=$7`,
              [
                paper.id,
                a.id,
                d.reason,
                cycle,
                section,
                setting.active_scheme_revision,
                p.code,
              ],
            );
        }
        for (const [i, g] of d.scheme.groups.entries()) {
          const group = (
            await db.query(
              "INSERT INTO result_groups(exam_cycle_id,section_id,name,display_order,target_max_marks,scheme_revision) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
              [cycle, section, g.name, i, g.max, revision],
            )
          ).rows[0];
          for (const code of g.paperCodes)
            await db.query(
              "INSERT INTO result_group_components(result_group_id,assessment_id,contribution_max) VALUES($1,$2,$3)",
              [
                group.id,
                ids.get(code),
                d.scheme.papers.find((p) => p.code === code)!.max,
              ],
            );
        }
        await audit(
          db,
          a,
          "REVISE_SCHEME",
          "exam_scheme_approvals",
          old.id,
          { revision: setting.active_scheme_revision },
          { revision, copyMarks: d.copyMarks, scheme: d.scheme },
          d.reason,
        );
        return { revision, approvalRequired: true };
      });
    },
  );
}
