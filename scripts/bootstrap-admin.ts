import {
  classLevelNames,
  instituteAttendance,
  institutePolicy,
} from "../packages/domain/src/index.ts";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { pool, transaction } from "../apps/api/src/db.ts";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL,
  password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error(
    "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ characters) securely",
  );
try {
  await transaction(async (db) => {
    const exists = await db.query("SELECT 1 FROM organizations");
    if (exists.rowCount)
      throw new Error(
        "Bootstrap only supports an empty database; invite additional admins from the portal",
      );
    const org = randomUUID(),
      user = randomUUID(),
      authId = randomUUID();
    await db.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
      org,
      process.env.INSTITUTE_NAME ?? "Hikmah Institute",
    ]);
    await db.query(
      "INSERT INTO organization_settings(organization_id,config) VALUES($1,$2)",
      [
        org,
        JSON.stringify({
          approvedAttendance: instituteAttendance,
          draftPolicy: institutePolicy,
        }),
      ],
    );
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
      [authId, "Administrator", email],
    );
    await db.query(
      'INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,\'credential\',$2,$3)',
      [randomUUID(), authId, await hashPassword(password)],
    );
    await db.query(
      "INSERT INTO app_users(id,auth_subject,email,display_name) VALUES($1,$2,$3,$4)",
      [user, authId, email, "Administrator"],
    );
    await db.query(
      "INSERT INTO organization_roles(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",
      [org, user],
    );
    await db.query(
      "INSERT INTO programs(organization_id,name,code) VALUES($1,'صباح','MORNING'),($1,'شام','EVENING')",
      [org],
    );
    for (let n = 1; n <= 9; n++)
      await db.query(
        "INSERT INTO levels(organization_id,ordinal,name_en,name_ur) VALUES($1,$2,$3,$3)",
        [org, n, classLevelNames[n - 1]],
      );
    console.log(
      "Initial administrator created. Configure institute identity and academic policies in the portal.",
    );
  });
} finally {
  await pool.end();
}
