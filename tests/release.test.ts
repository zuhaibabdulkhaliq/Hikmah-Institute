import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { verifyPassword } from "better-auth/crypto";
import { buildApp } from "../apps/api/src/server.ts";
import { pool } from "../apps/api/src/db.ts";
import { translate, languageOf } from "../packages/ui-tokens/src/i18n.ts";
import { ur } from "../packages/ui-tokens/src/messages.ts";
import {
  normalizeServerURL,
  createClient,
  ApiError,
} from "../packages/api-client/src/index.ts";
const app = await buildApp();
after(async () => {
  await app.close();
  await pool.end();
});
let ip = 1;
async function login(email: string, password: string) {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    remoteAddress: `127.12.0.${ip++}`,
    payload: { email, password },
  });
  return {
    response: r,
    headers: { authorization: "Bearer " + r.json().token },
  };
}
test("Account passwords are hashed; owner changes require current password, revoke all sessions, and administrator resets remain scoped and audited without secrets", async () => {
  const admin = await login("admin@hikmah.example", process.env.DEMO_PASSWORD!);
  assert.equal(admin.response.statusCode, 200);
  const email = `release-${randomUUID()}@hikmah.example`,
    first = "Synthetic-Initial-2026!",
    next = "Synthetic-Updated-2026!",
    reset = "Synthetic-Reset-2026!";
  const created = await app.inject({
    method: "POST",
    url: "/v1/users",
    headers: admin.headers,
    payload: { name: "Synthetic release account", email, password: first },
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id;
  const section = (
    await pool.query(
      "SELECT s.id FROM sections s JOIN academic_years y ON y.id=s.academic_year_id WHERE s.code='A' AND y.label='1448 synthetic' LIMIT 1",
    )
  ).rows[0].id;
  const assigned = await app.inject({
    method: "POST",
    url: `/v1/sections/${section}/staff`,
    headers: admin.headers,
    payload: {
      user_id: id,
      role: "AMEER",
      starts_on: "2026-01-01",
      ameerOverrideReason: "Synthetic owner-password test assignment",
    },
  });
  assert.equal(assigned.statusCode, 200, assigned.body);
  const owner = await login(email, first),
    otherDevice = await login(email, first);
  assert.equal(owner.response.statusCode, 200);
  const hash = async () =>
    (
      await pool.query(
        'SELECT c.password FROM account c JOIN app_users u ON c."userId"=u.auth_subject WHERE u.id=$1',
        [id],
      )
    ).rows[0].password;
  const originalHash = await hash();
  assert.notEqual(originalHash, first);
  assert(await verifyPassword({ hash: originalHash, password: first }));
  const change = (headers: any, currentPassword: string, password: string) =>
    app.inject({
      method: "PUT",
      url: "/v1/me/password",
      remoteAddress: `127.12.1.${ip++}`,
      headers,
      payload: { currentPassword, password },
    });
  const wrong = await change(owner.headers, "Wrong-current-password!", next);
  assert.equal(wrong.statusCode, 403);
  assert.equal(await hash(), originalHash);
  assert.equal((await change(owner.headers, first, "short")).statusCode, 400);
  const denied = await app.inject({
    method: "PUT",
    url: `/v1/users/${id}/password`,
    headers: owner.headers,
    payload: { password: reset, reason: "Unauthorized admin reset attempt" },
  });
  assert.equal(denied.statusCode, 403);
  const changed = await change(owner.headers, first, next);
  assert.equal(changed.statusCode, 200, changed.body);
  assert.notEqual(await hash(), originalHash);
  assert(await verifyPassword({ hash: await hash(), password: next }));
  for (const h of [owner.headers, otherDevice.headers])
    assert.equal(
      (await app.inject({ url: "/v1/me", headers: h })).statusCode,
      401,
    );
  assert.equal((await login(email, first)).response.statusCode, 401);
  const fresh = await login(email, next);
  assert.equal(fresh.response.statusCode, 200);
  const adminReset = await app.inject({
    method: "PUT",
    url: `/v1/users/${id}/password`,
    headers: admin.headers,
    payload: {
      password: reset,
      reason: "Private synthetic administrator reset",
    },
  });
  assert.equal(adminReset.statusCode, 200, adminReset.body);
  assert.equal(
    (await app.inject({ url: "/v1/me", headers: fresh.headers })).statusCode,
    401,
  );
  assert.equal((await login(email, reset)).response.statusCode, 200);
  const audit = await pool.query(
    "SELECT action,before_data,after_data,reason FROM audit_events WHERE object_id=$1 AND action IN ('SELF_PASSWORD_CHANGE','ADMIN_PASSWORD_CHANGE','CREATE_ACCOUNT')",
    [id],
  );
  assert(audit.rows.some((r) => r.action === "SELF_PASSWORD_CHANGE"));
  assert(audit.rows.some((r) => r.action === "ADMIN_PASSWORD_CHANGE"));
  for (const secret of [first, next, reset, await hash()])
    assert(!JSON.stringify(audit.rows).includes(secret));
  const beforeSeed = await hash();
  execFileSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
    env: { ...process.env, NODE_ENV: "test" },
    stdio: "pipe",
  });
  assert.equal(
    await hash(),
    beforeSeed,
    "Routine startup must not reset an existing password",
  );
});
test("English/Urdu catalogue preserves dynamic values, CSV/data text, whitespace and template placeholders", () => {
  assert.equal(languageOf("ur"), "ur");
  assert.equal(languageOf("invalid"), "en");
  assert.equal(translate("ur", "Sign in"), "داخل ہوں");
  assert.equal(translate("en", "Sign in"), "Sign in");
  assert.equal(translate("ur", "  Attendance  "), "  حاضری  ");
  assert.equal(translate("ur", "Paper 3 code"), "پرچہ 3 کا کوڈ");
  assert.equal(
    translate("ur", "Published · revision $&"),
    "شائع شدہ · نظرثانی $&",
  );
  for (const value of [
    "SYN-001",
    "حسن احمد",
    "student_number",
    "=HYPERLINK()",
    "2030-01-10",
    "constructor",
    "toString",
    "__proto__",
  ])
    assert.equal(translate("ur", value), value);
  for (const [key, value] of Object.entries(ur)) {
    assert(value.trim(), key);
    assert.deepEqual(
      [...key.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
      [...value.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
      key,
    );
  }
});
test("Mobile server configuration requires HTTPS, rejects credential URLs, and permits private HTTP only during explicit development", () => {
  assert.equal(
    normalizeServerURL(" https://school.example.org/ "),
    "https://school.example.org",
  );
  assert.equal(
    normalizeServerURL("http://192.168.1.20:3000", true),
    "http://192.168.1.20:3000",
  );
  for (const url of [
    "http://school.example.org",
    "http://192.168.evil.com",
    "https://user:secret@school.example.org",
    "https://school.example.org/login",
    "https://school.example.org?token=secret",
    "file:///private/data",
    "invalid",
  ])
    assert.throws(() => normalizeServerURL(url, true));
  assert.throws(() => normalizeServerURL("http://192.168.1.20:3000"));
});
test("Native API uses bearer without cookies; browser requests retain cookies and invalid sessions invoke the session handler", async () => {
  const original = globalThis.fetch,
    seen: RequestInit[] = [];
  let ended = false;
  globalThis.fetch = async (_input, options) => {
    seen.push(options ?? {});
    return new Response(JSON.stringify({ message: "Sign in required" }), {
      status: 401,
    });
  };
  try {
    await assert.rejects(
      createClient(
        "https://school.example.org",
        async () => "synthetic-token",
        () => {
          ended = true;
        },
      )("/v1/me"),
      ApiError,
    );
    assert(ended);
    assert.equal(seen[0].credentials, "omit");
    assert.equal(
      (seen[0].headers as Record<string, string>).Authorization,
      "Bearer synthetic-token",
    );
    await assert.rejects(createClient("")("/v1/me"), ApiError);
    assert.equal(seen[1].credentials, "include");
  } finally {
    globalThis.fetch = original;
  }
});
test("Fresh local demo has a documented constant login password and preserves credentials on subsequent startup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hikmah-demo-init-"));
  try {
    await mkdir(join(dir, "scripts"));
    await copyFile("scripts/init-demo.sh", join(dir, "scripts/init-demo.sh"));
    execFileSync("bash", [join(dir, "scripts/init-demo.sh")], {
      env: { ...process.env, HIKMAH_INITIAL_DEMO_PASSWORD: "" },
      stdio: "pipe",
    });
    const first = await readFile(join(dir, ".env.demo"), "utf8");
    assert(first.includes("HIKMAH_DEMO_PASSWORD=HikmahDemo2026!"));
    execFileSync("bash", [join(dir, "scripts/init-demo.sh")], {
      stdio: "pipe",
    });
    assert.equal(await readFile(join(dir, ".env.demo"), "utf8"), first);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Explicit fixed-demo setup changes only the six synthetic accounts, uses distinct salted hashes and leaves academic data unchanged", async () => {
  const script = await readFile("scripts/use-fixed-demo-password.sh", "utf8");
  const code = script.split("<<'NODE'\n")[1].split("\nNODE")[0];
  const before = (
    await pool.query(
      `SELECT id,password FROM account WHERE "providerId"='credential'`,
    )
  ).rows;
  const academicCounts = async () =>
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM students) AS students,(SELECT count(*) FROM marks) AS marks,(SELECT count(*) FROM result_runs) AS results",
      )
    ).rows[0];
  const counts = await academicCounts();
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      env: { ...process.env, NODE_ENV: "test" },
      stdio: "pipe",
    });
    const demo = (
      await pool.query(
        `SELECT c.password FROM account c JOIN "user" u ON u.id=c."userId" WHERE u.email IN ('admin@hikmah.example','admin2@hikmah.example','teacher@hikmah.example','mushrif@hikmah.example','subject@hikmah.example','ameer@hikmah.example')`,
      )
    ).rows;
    assert.equal(demo.length, 6);
    assert.equal(new Set(demo.map((r) => r.password)).size, 6);
    for (const { password } of demo)
      assert(
        await verifyPassword({ hash: password, password: "HikmahDemo2026!" }),
      );
    assert.deepEqual(await academicCounts(), counts);
    assert.throws(() =>
      execFileSync(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
      }),
    );
    const nonDemo = (
      await pool.query(
        `SELECT c.id,c.password FROM account c JOIN "user" u ON u.id=c."userId" WHERE u.email NOT IN ('admin@hikmah.example','admin2@hikmah.example','teacher@hikmah.example','mushrif@hikmah.example','subject@hikmah.example','ameer@hikmah.example') AND c."providerId"='credential'`,
      )
    ).rows;
    for (const account of nonDemo)
      assert.equal(
        account.password,
        before.find((r) => r.id === account.id)?.password,
      );
  } finally {
    for (const account of before)
      await pool.query("UPDATE account SET password=$2 WHERE id=$1", [
        account.id,
        account.password,
      ]);
  }
});

test("Rate limits separate validated users behind one proxy; random bearer values cannot evade anonymous limits", async () => {
  const signed = await login(
    "admin2@hikmah.example",
    process.env.DEMO_PASSWORD!,
  );
  const address = "127.15.0.1";
  for (let i = 0; i < 301; i++) {
    const r = await app.inject({
      url: "/v1/me",
      remoteAddress: address,
      headers: { authorization: `Bearer invalid-token-${i}` },
    });
    assert.equal(r.statusCode, i < 300 ? 401 : 429, r.body);
  }
  const valid = await app.inject({
    url: "/v1/me",
    remoteAddress: address,
    headers: signed.headers,
  });
  assert.equal(valid.statusCode, 200, valid.body);
});

test("Institute identity can be managed by administrators without changing archived results; other roles are denied", async () => {
  const admin = await login("admin@hikmah.example", process.env.DEMO_PASSWORD!);
  const ameer = await login("ameer@hikmah.example", process.env.DEMO_PASSWORD!);
  const before = (
    await app.inject({ url: "/v1/institute", headers: admin.headers })
  ).json();
  const update = (h: any, data: any) =>
    app.inject({
      method: "PATCH",
      url: "/v1/institute",
      headers: h,
      payload: data,
    });
  assert.equal((await update(ameer.headers, before)).statusCode, 403);
  assert.equal(
    (await update(admin.headers, { ...before, name: " " })).statusCode,
    400,
  );
  const names = {
    name: "Hikmah Institute",
    name_ur: "حکمہ انسٹیٹیوٹ کراچی",
    official_display_name: "Hikmah Institute Karachi",
    timezone: before.timezone,
  };
  try {
    assert.equal((await update(admin.headers, names)).statusCode, 200);
    const actual = (
      await app.inject({ url: "/v1/institute", headers: admin.headers })
    ).json();
    for (const key of Object.keys(names))
      assert.equal(actual[key], names[key as keyof typeof names]);
  } finally {
    await pool.query(
      "UPDATE organizations SET name=$2,name_ur=$3,official_display_name=$4,timezone=$5 WHERE id=$1",
      [
        before.id,
        before.name,
        before.name_ur,
        before.official_display_name,
        before.timezone,
      ],
    );
  }
});
