import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { transaction } from "./db.ts";
import { actor, admin, check, audit } from "./security.ts";
import { uuid } from "../../../packages/domain/src/index.ts";
export function accounts(app: FastifyInstance) {
  app.put(
    "/v1/me/password",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      const a = await actor(req);
      const d = z
        .object({
          currentPassword: z.string().min(1).max(128),
          password: z.string().min(12).max(128),
        })
        .parse(req.body);
      return transaction(async (db) => {
        const user = (
          await db.query(
            `SELECT u.auth_subject,c.password FROM app_users u JOIN account c ON c."userId"=u.auth_subject AND c."providerId"='credential' WHERE u.id=$1 AND u.active FOR UPDATE OF u,c`,
            [a.id],
          )
        ).rows[0];
        check(
          user &&
            (await verifyPassword({
              hash: user.password,
              password: d.currentPassword,
            })),
          "Current password is incorrect",
          403,
        );
        await db.query(
          `UPDATE account SET password=$2,"updatedAt"=now() WHERE "userId"=$1 AND "providerId"='credential'`,
          [user.auth_subject, await hashPassword(d.password)],
        );
        await db.query('DELETE FROM session WHERE "userId"=$1', [
          user.auth_subject,
        ]);
        await audit(
          db,
          a,
          "SELF_PASSWORD_CHANGE",
          "app_users",
          a.id,
          null,
          { sessionsRevoked: true },
          "Account owner changed password after verifying the current password",
        );
        return { ok: true };
      });
    },
  );
  app.post("/v1/users", async (req, reply) => {
    const a = await actor(req);
    admin(a);
    const d = z
      .object({
        email: z.email(),
        name: z.string().min(1).max(150),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const hash = await hashPassword(d.password);
    return transaction(async (db) => {
      const authId = randomUUID(),
        id = randomUUID();
      await db.query(
        'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
        [authId, d.name, d.email.toLowerCase()],
      );
      await db.query(
        `INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,'credential',$2,$3)`,
        [randomUUID(), authId, hash],
      );
      await db.query(
        "INSERT INTO app_users(id,auth_subject,email,display_name) VALUES($1,$2,$3,$4)",
        [id, authId, d.email.toLowerCase(), d.name],
      );
      await audit(db, a, "CREATE_ACCOUNT", "app_users", id, null, {
        email: d.email,
        name: d.name,
      });
      reply.code(201);
      return { id, email: d.email, name: d.name };
    });
  });
  app.put("/v1/users/:id/password", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id),
      d = z
        .object({
          password: z.string().min(12).max(128),
          reason: z.string().min(5).max(1000),
        })
        .parse(req.body),
      hash = await hashPassword(d.password);
    return transaction(async (db) => {
      const user = (
        await db.query(
          "SELECT * FROM app_users WHERE id=$1 AND active FOR UPDATE",
          [id],
        )
      ).rows[0];
      check(user, "Active account unavailable", 404);
      const r = await db.query(
        `UPDATE account SET password=$2,"updatedAt"=now() WHERE "userId"=$1 AND "providerId"='credential'`,
        [user.auth_subject, hash],
      );
      check(r.rowCount, "Password account unavailable", 404);
      await db.query('DELETE FROM session WHERE "userId"=$1', [
        user.auth_subject,
      ]);
      await audit(
        db,
        a,
        "ADMIN_PASSWORD_CHANGE",
        "app_users",
        id,
        null,
        { sessionsRevoked: true },
        d.reason,
      );
      return { ok: true };
    });
  });
}
