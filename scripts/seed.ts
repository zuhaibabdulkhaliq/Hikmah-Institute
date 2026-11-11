import {
  classLevelNames,
  instituteAttendance,
  institutePolicy,
} from "../packages/domain/src/index.ts";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { pool, transaction } from "../apps/api/src/db.ts";
const password = process.env.DEMO_PASSWORD;
if (process.env.NODE_ENV === "production" || !password || password.length < 12)
  throw new Error("Seed is local only; set DEMO_PASSWORD (12+ characters)");
export const id = (key: string) => {
  const h = createHash("sha256")
    .update("hikmah-demo:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const scheme = JSON.parse(
  await readFile(
    "Hikmah_Final_Blueprint/examples/shash_mahi_1448_level3_evening_scheme.json",
    "utf8",
  ),
);
const expected = JSON.parse(
  await readFile(
    "Hikmah_Final_Blueprint/examples/synthetic_results_expected.json",
    "utf8",
  ),
);
const hashed = await hashPassword(password);
try {
  await transaction(async (db) => {
    if (
      (await db.query("SELECT 1 FROM organizations WHERE id=$1", [id("org")]))
        .rowCount
    ) {
      if (
        !(
          await db.query("SELECT 1 FROM app_users WHERE id=$1", [id("mushrif")])
        ).rowCount
      ) {
        const uid = id("mushrif");
        await db.query(
          'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
          [uid, "Demo Mushrif", "mushrif@hikmah.example"],
        );
        await db.query(
          `INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,'credential',$2,$3)`,
          [randomUUID(), uid, hashed],
        );
        await db.query(
          "INSERT INTO app_users(id,auth_subject,email,display_name) VALUES($1::text::uuid,$1::text,$2,$3)",
          [uid, "mushrif@hikmah.example", "Demo Mushrif"],
        );
        await db.query(
          "INSERT INTO section_staff_assignments(section_id,user_id,role,starts_on) VALUES($1,$2,'MUSHRIF','2026-01-01')",
          [id("sectionA"), uid],
        );
      }
      if (
        !(
          await db.query("SELECT 1 FROM app_users WHERE id=$1", [id("subject")])
        ).rowCount
      ) {
        const uid = id("subject");
        await db.query(
          'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
          [uid, "Demo subject teacher", "subject@hikmah.example"],
        );
        await db.query(
          `INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,'credential',$2,$3)`,
          [randomUUID(), uid, hashed],
        );
        await db.query(
          "INSERT INTO app_users(id,auth_subject,email,display_name) VALUES($1::text::uuid,$1::text,$2,$3)",
          [uid, "subject@hikmah.example", "Demo subject teacher"],
        );
        for (const code of ["P01", "P02", "P03"])
          await db.query(
            "INSERT INTO subject_teacher_assignments(section_subject_id,teacher_user_id,starts_on) VALUES($1,$2,'2026-01-01')",
            [id("offering" + code), uid],
          );
      }
      for (const code of ["A", "B"])
        await db.query(
          "UPDATE sections s SET level_id=$3 WHERE s.id=$1 AND s.organization_id=$2 AND s.level_id=$4 AND s.name=$5 AND NOT EXISTS(SELECT 1 FROM sections other WHERE other.id<>s.id AND other.academic_year_id=s.academic_year_id AND other.program_id=s.program_id AND other.code=s.code AND other.level_id=$3)",
          [
            id("section" + code),
            id("org"),
            id("level4"),
            id("level3"),
            `ثالثہ — ${code}`,
          ],
        );
      console.log(
        "Synthetic seed retained; missing Mushrif demo account added without changing existing passwords",
      );
      return;
    }
    await db.query(
      "INSERT INTO organizations(id,name,name_ur) VALUES($1,$2,$3)",
      [id("org"), "Hikmah Institute — synthetic demo", "حکمہ انسٹیٹیوٹ"],
    );
    await db.query(
      "INSERT INTO organization_settings(organization_id,config) VALUES($1,$2)",
      [
        id("org"),
        JSON.stringify({
          approvedAttendance: instituteAttendance,
          draftPolicy: institutePolicy,
        }),
      ],
    );
    for (const role of [
      "admin",
      "admin2",
      "teacher",
      "ameer",
      "mushrif",
      "subject",
    ]) {
      const uid = id(role);
      await db.query(
        'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
        [uid, `Demo ${role}`, `${role}@hikmah.example`],
      );
      await db.query(
        'INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,\'credential\',$2,$3)',
        [randomUUID(), uid, hashed],
      );
      await db.query(
        "INSERT INTO app_users(id,auth_subject,email,display_name) VALUES($1::text::uuid,$1::text,$2,$3)",
        [uid, `${role}@hikmah.example`, `Demo ${role}`],
      );
      if (role.startsWith("admin"))
        await db.query(
          "INSERT INTO organization_roles(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",
          [id("org"), uid],
        );
    }
    await db.query(
      "INSERT INTO academic_years(id,organization_id,label,hijri_label,start_date,end_date,state) VALUES($1,$2,'1448 synthetic','1448','2026-01-01','2027-12-31','ACTIVE')",
      [id("year"), id("org")],
    );
    await db.query(
      "INSERT INTO programs(id,organization_id,name,code) VALUES($1,$2,'شام','EVENING')",
      [id("program"), id("org")],
    );
    await db.query(
      "INSERT INTO programs(organization_id,name,code) VALUES($1,'صباح','MORNING')",
      [id("org")],
    );
    for (let n = 1; n <= 9; n++)
      await db.query(
        "INSERT INTO levels(id,organization_id,ordinal,name_en,name_ur) VALUES($1,$2,$3,$4,$4)",
        [id("level" + n), id("org"), n, classLevelNames[n - 1]],
      );
    for (const code of ["A", "B"])
      await db.query(
        "INSERT INTO sections(id,organization_id,academic_year_id,program_id,level_id,code,name) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id("section" + code),
          id("org"),
          id("year"),
          id("program"),
          id("level4"),
          code,
          `ثالثہ — ${code}`,
        ],
      );
    for (const role of ["mushrif", "ameer"])
      await db.query(
        "INSERT INTO section_staff_assignments(section_id,user_id,role,starts_on) VALUES($1,$2,$3,'2026-01-01')",
        [id("sectionA"), id(role), role === "mushrif" ? "MUSHRIF" : "AMEER"],
      );
    for (let n = 0; n < 20; n++) {
      const student = n < 2 ? expected.students[n] : null;
      const code =
        student?.student_number ?? `SYN-${String(n + 1).padStart(3, "0")}`;
      await db.query(
        "INSERT INTO students(id,organization_id,student_number,full_name,linked_user_id) VALUES($1,$2,$3,$4,$5)",
        [
          id(code),
          id("org"),
          code,
          student?.synthetic_name ?? `Synthetic learner ${n + 1}`,
          n === 0 ? id("ameer") : null,
        ],
      );
      await db.query(
        "INSERT INTO enrollments(id,student_id,section_id,roll_number,joined_on) VALUES($1,$2,$3,$4,'2026-01-01')",
        [
          id("enrollment" + n),
          id(code),
          id("sectionA"),
          String(n + 1).padStart(2, "0"),
        ],
      );
    }
    for (const [index, code] of ["SEH_MAHI", "SHASH_MAHI", "MOCK"].entries())
      await db.query(
        "INSERT INTO exam_cycles(id,academic_year_id,code,title,sort_order,attendance_from,attendance_through) VALUES($1,$2,$3,$3,$4,'2026-01-01','2026-01-01')",
        [id(code), id("year"), code, index],
      );
    for (const paper of scheme.papers) {
      await db.query(
        "INSERT INTO subjects(id,organization_id,code,name_en,name_ur) VALUES($1,$2,$3,$3,$4)",
        [id("subject" + paper.code), id("org"), paper.code, paper.label_ur],
      );
      await db.query(
        "INSERT INTO section_subjects(id,section_id,subject_id,display_order) VALUES($1,$2,$3,$4)",
        [
          id("offering" + paper.code),
          id("sectionA"),
          id("subject" + paper.code),
          paper.display_order_rtl,
        ],
      );
      if (["P01", "P02", "P03"].includes(paper.code))
        for (const teacherRole of ["teacher", "subject"])
          await db.query(
            "INSERT INTO subject_teacher_assignments(section_subject_id,teacher_user_id,starts_on) VALUES($1,$2,'2026-01-01')",
            [id("offering" + paper.code), id(teacherRole)],
          );
      await db.query(
        "INSERT INTO exam_assessments(id,exam_cycle_id,section_subject_id,title,display_label_ur,paper_code,max_marks,display_order) VALUES($1,$2,$3,$4,$4,$5,$6,$7)",
        [
          id(paper.code),
          id("SHASH_MAHI"),
          id("offering" + paper.code),
          paper.label_ur,
          paper.code,
          paper.max_marks,
          paper.display_order_rtl,
        ],
      );
      for (let n = 0; n < 2; n++)
        await db.query(
          "INSERT INTO marks(assessment_id,enrollment_id,entry_state,awarded,entered_by,on_time) VALUES($1,$2,'GRADED',$3,$4,true)",
          [
            id(paper.code),
            id("enrollment" + n),
            expected.students[n].marks_rtl[paper.display_order_rtl - 1],
            id("admin"),
          ],
        );
    }
    for (const [index, g] of scheme.result_groups.entries()) {
      await db.query(
        "INSERT INTO result_groups(id,exam_cycle_id,section_id,name,display_order,target_max_marks) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id(g.code),
          id("SHASH_MAHI"),
          id("sectionA"),
          g.code,
          index,
          g.max_marks,
        ],
      );
      for (const code of g.paper_codes) {
        const p = scheme.papers.find((p: any) => p.code === code);
        await db.query(
          "INSERT INTO result_group_components(result_group_id,assessment_id,contribution_max) VALUES($1,$2,$3)",
          [id(g.code), id(code), p.max_marks],
        );
      }
    }
    await db.query(
      "INSERT INTO section_curricula(section_id,scheme,updated_by) VALUES($1,$2,$3)",
      [
        id("sectionA"),
        JSON.stringify({
          papers: scheme.papers.map((p: any) => ({
            code: p.code,
            offeringId: id("offering" + p.code),
            label: p.label_ur,
            max: p.max_marks,
            type: p.type,
            pattern: "",
            date: null,
          })),
          groups: scheme.result_groups.map((g: any) => ({
            name: g.code,
            max: g.max_marks,
            paperCodes: g.paper_codes,
          })),
        }),
        id("admin"),
      ],
    );
    console.log(
      "Seeded 2 admins, teacher, Ameer, 9 levels, 2 sections, 20 synthetic learners, 3 cycles and proposed 11-paper scheme. Policies remain unapproved.",
    );
  });
} finally {
  await pool.end();
}
