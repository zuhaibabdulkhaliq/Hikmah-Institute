import type { FastifyInstance } from "fastify";
import { z } from "zod";
import Decimal from "decimal.js";
import { parse } from "csv-parse/sync";
import { pool } from "./db.ts";
import { actor, check } from "./security.ts";
import { paperScope } from "./exams.ts";
import {
  markInput,
  markStates,
  uuid,
} from "../../../packages/domain/src/index.ts";
export function markImport(app: FastifyInstance) {
  app.post("/v1/assessments/:id/marks/import/preview", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id);
    const paper = await paperScope(pool, a, id);
    const { csv, reason } = z
      .object({
        csv: z.string().max(500000),
        reason: z.string().min(5).max(1000),
      })
      .parse(req.body);
    let rows: any[];
    try {
      rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true });
    } catch {
      check(false, "Malformed CSV");
    }
    check(rows.length <= 500, "Maximum 500 rows");
    const seen = new Set<string>(),
      entries: any[] = [],
      errors: any[] = [];
    for (const [index, row] of rows.entries()) {
      const number = String(row.student_number ?? "");
      if (seen.has(number)) {
        errors.push({ row: index + 2, message: "Duplicate student number" });
        continue;
      }
      seen.add(number);
      const enrolled = (
        await pool.query(
          "SELECT e.id,m.version FROM enrollments e JOIN students s ON s.id=e.student_id LEFT JOIN marks m ON m.enrollment_id=e.id AND m.assessment_id=$1 WHERE e.section_id=$2 AND s.student_number=$3",
          [id, paper.section_id, number],
        )
      ).rows[0];
      if (!enrolled) {
        errors.push({
          row: index + 2,
          message: "Student is not in the assigned paper roster",
        });
        continue;
      }
      const cell = row[paper.paper_code];
      if (cell === undefined) {
        errors.push({
          row: index + 2,
          message: `Missing ${paper.paper_code} column`,
        });
        continue;
      }
      const raw = String(cell).trim();
      let state: (typeof markStates)[number] = "UNKNOWN_LEGACY_BLANK",
        awarded: number | null = null;
      if (raw) {
        if (markStates.includes(raw as any)) state = raw as typeof state;
        else {
          try {
            const score = new Decimal(raw);
            check(
              score.gte(0) &&
                score.lte(paper.max_marks) &&
                score.mul(100).isInteger(),
              "Score outside paper range/precision",
            );
            state = "GRADED";
            awarded = score.toNumber();
          } catch {
            errors.push({
              row: index + 2,
              message:
                "Invalid score/status; formulas, negatives, excess precision and scores above maximum are rejected",
            });
            continue;
          }
        }
      }
      const parsed = markInput.safeParse({
        enrollmentId: enrolled.id,
        state,
        awarded,
        version: enrolled.version ?? 0,
        reason,
      });
      if (!parsed.success) {
        errors.push({
          row: index + 2,
          message: "State requires a numeric awarded value only for GRADED",
        });
        continue;
      }
      entries.push(parsed.data);
    }
    return {
      entries,
      errors,
      canApply: entries.length > 0 && errors.length === 0,
      paperCode: paper.paper_code,
    };
  });
}
