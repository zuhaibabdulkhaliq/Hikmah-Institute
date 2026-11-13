import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Readable, Writable } from "node:stream";
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { pool } from "../apps/api/src/db.ts";
import {
  encryptBackup,
  decryptBackup,
  databaseFromCompose,
} from "../scripts/backup-crypto.ts";
import { createClient, ApiError } from "../packages/api-client/src/index.ts";
after(async () => {
  await pool.end();
});
function collector() {
  const chunks: Buffer[] = [];
  return {
    chunks,
    stream: new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    }),
  };
}
async function administratorPromptScript() {
  const source = await readFile("scripts/institute.sh", "utf8");
  const match = source.match(/^  bootstrap_script='\n([\s\S]*?)\n'$/m);
  assert(match, "Administrator stdin wrapper missing");
  return match[1];
}
test("Administrator prompts identify invalid input without disclosing secrets or connecting to the database", async () => {
  const code = await administratorPromptScript();
  for (const [email, password, message] of [
    ["not-an-email", "Private-valid-password-2026!", "email is invalid"],
    ["owner@institute.example", "DO-NOT-LEAK", "Password length is 11"],
    ["owner@institute.example", "", "Password length is 0"],
    ["owner@institute.example", "secret".repeat(22), "Password length is 132"],
    ["owner@institute.example", "private".repeat(2000), "Input is too long"],
  ]) {
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", code],
          {
            env: { ...process.env, DATABASE_URL: "not-a-database-url" },
            input: `${email}\n${password}\n`,
            stdio: "pipe",
          },
        ),
      (error: any) => {
        const stderr = String(error.stderr),
          stdout = String(error.stdout);
        assert.equal(error.status, 1);
        assert(stderr.includes(message), stderr);
        assert(!stderr.includes(email));
        if (password) assert(!stderr.includes(password));
        assert.equal(stdout, "");
        assert(!stderr.includes("at ModuleJob"), "Avoid raw stack traces");
        return true;
      },
    );
  }
});
test("Authenticated backups stream arbitrary data, use fresh salts and work with standalone Node 24", async () => {
  const data = Buffer.concat([
      randomBytes(131072),
      Buffer.from("حکمہ — محفوظ طلبہ اور نتائج"),
      Buffer.alloc(123),
    ]),
    password = randomBytes(32);
  const enc = collector();
  await encryptBackup(
    Readable.from([data.subarray(0, 3), data.subarray(3)]),
    enc.stream,
    password,
  );
  const bytes = Buffer.concat(enc.chunks);
  assert(!bytes.includes(Buffer.from("محفوظ طلبہ")));
  const other = collector();
  await encryptBackup(Readable.from([data]), other.stream, password);
  assert(!bytes.equals(Buffer.concat(other.chunks)));
  const dec = collector();
  await decryptBackup(
    Readable.from(
      Array.from({ length: Math.ceil(bytes.length / 7) }, (_, i) =>
        bytes.subarray(i * 7, i * 7 + 7),
      ),
    ),
    dec.stream,
    password,
  );
  assert.deepEqual(Buffer.concat(dec.chunks), data);
  const dir = await mkdtemp(join(tmpdir(), "hikmah-key-test-"));
  try {
    const key = join(dir, "key");
    await writeFile(key, randomBytes(32).toString("hex") + "\n", {
      mode: 0o600,
    });
    const env = { ...process.env, BACKUP_KEY_FILE: key };
    const encrypted = execFileSync(
      process.execPath,
      ["scripts/backup-crypto.ts", "encrypt"],
      { env, input: data },
    );
    const plain = execFileSync(
      process.execPath,
      ["scripts/backup-crypto.ts", "decrypt"],
      { env, input: encrypted },
    );
    assert.deepEqual(plain, data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Changed, truncated or wrongly keyed backups release no plaintext to a restore process", async () => {
  const password = randomBytes(32),
    source = collector();
  await encryptBackup(
    Readable.from([Buffer.from("private academic data ".repeat(1000))]),
    source.stream,
    password,
  );
  const encrypted = Buffer.concat(source.chunks);
  const changed = Buffer.from(encrypted);
  changed[70] ^= 1;
  const alteredHeader = Buffer.from(encrypted);
  alteredHeader[20] ^= 1;
  const badTag = Buffer.from(encrypted);
  badTag[badTag.length - 1] ^= 1;
  for (const [input, key] of [
    [changed, password],
    [alteredHeader, password],
    [badTag, password],
    [encrypted.subarray(0, -5), password],
    [encrypted.subarray(0, 8), password],
    [encrypted, randomBytes(32)],
  ] as const) {
    const sink = collector();
    await assert.rejects(
      decryptBackup(Readable.from([input]), sink.stream, key),
    );
    assert.equal(Buffer.concat(sink.chunks).length, 0);
  }
  await assert.rejects(
    encryptBackup(
      Readable.from(["data"]),
      collector().stream,
      Buffer.from("short"),
    ),
  );
});
test("Institute initialization preserves private credentials and never defines a public demo login password", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hikmah-institute-init-"));
  try {
    await mkdir(join(dir, "scripts"));
    await copyFile(
      "scripts/init-institute.sh",
      join(dir, "scripts/init-institute.sh"),
    );
    execFileSync("bash", [join(dir, "scripts/init-institute.sh")], {
      stdio: "pipe",
    });
    const before = await readFile(join(dir, ".env.institute"), "utf8");
    assert(!before.includes("DEMO_PASSWORD"));
    assert(before.includes("HIKMAH_INSTITUTE_PORT=3002"));
    execFileSync("bash", [join(dir, "scripts/init-institute.sh")], {
      stdio: "pipe",
    });
    assert.equal(await readFile(join(dir, ".env.institute"), "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Fresh institute bootstrap starts without demo students, subjects, classes or sample accounts and remains empty across migrations", async () => {
  const database = "hikmah_clean_test_" + randomBytes(8).toString("hex"),
    url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/" + database;
  await pool.query(`CREATE DATABASE ${database}`);
  const db = new pg.Pool({ connectionString: url.toString() });
  try {
    const env = {
      ...process.env,
      DATABASE_URL: url.toString(),
      NODE_ENV: "production",
      AUTH_COOKIE_PREFIX: "hikmah-institute",
      BOOTSTRAP_ADMIN_EMAIL: "Owner@institute.example",
      BOOTSTRAP_ADMIN_PASSWORD: "  Private-owner-'$`\\-2026-release!  ",
      INSTITUTE_NAME: "Synthetic fresh institute",
    };
    execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
      env,
      stdio: "pipe",
    });
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        await administratorPromptScript(),
      ],
      {
        env,
        input: ` \t${env.BOOTSTRAP_ADMIN_EMAIL}\t \n${env.BOOTSTRAP_ADMIN_PASSWORD}\n`,
        stdio: "pipe",
      },
    );
    const check = async () => {
      const row = (
        await db.query(
          `SELECT (SELECT count(*)::int FROM students) students,(SELECT count(*)::int FROM subjects) subjects,(SELECT count(*)::int FROM sections) sections,(SELECT count(*)::int FROM academic_years) years,(SELECT count(*)::int FROM app_users) users,(SELECT count(*)::int FROM programs) programs,(SELECT count(*)::int FROM levels) levels`,
        )
      ).rows[0];
      assert.deepEqual(row, {
        students: 0,
        subjects: 0,
        sections: 0,
        years: 0,
        users: 1,
        programs: 2,
        levels: 9,
      });
      assert.equal(
        (await db.query("SELECT email FROM app_users")).rows[0].email,
        "owner@institute.example",
      );
      const config = (
        await db.query("SELECT config FROM organization_settings")
      ).rows[0].config;
      assert(!config.approvedPolicy);
    };
    await check();
    execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
      env,
      stdio: "pipe",
    });
    await check();
    assert.throws(() =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/bootstrap-admin.ts"],
        { env, stdio: "pipe" },
      ),
    );
    const loginCode = `import {buildApp} from './apps/api/src/server.ts';import {pool} from './apps/api/src/db.ts';const app=await buildApp();const r=await app.inject({method:'POST',url:'/api/auth/sign-in/email',payload:{email:'owner@institute.example',password:process.env.BOOTSTRAP_ADMIN_PASSWORD}});if(r.statusCode!==200)throw Error('Fresh owner sign-in failed');if(!JSON.stringify(r.headers['set-cookie']).includes('hikmah-institute.session_token'))throw Error('Institute cookie namespace missing');await app.close();await pool.end();`;
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", loginCode],
      { env: { ...env, NODE_ENV: "test", LOG_LEVEL: "silent" }, stdio: "pipe" },
    );
  } finally {
    await db.end();
    await pool.query(`DROP DATABASE ${database} WITH (FORCE)`);
  }
});
test("Backup selection follows the actual API recovery database and rejects external database mismatches", () => {
  assert.equal(
    databaseFromCompose({
      services: {
        db: { environment: { POSTGRES_DB: "hikmah" } },
        api: {
          environment: {
            DATABASE_URL:
              "postgres://private:secret@db:5432/hikmah_recovery_123",
          },
        },
      },
    }),
    "hikmah_recovery_123",
  );
  assert.equal(
    databaseFromCompose({
      services: { db: { environment: { POSTGRES_DB: "hikmah" } } },
    }),
    "hikmah",
  );
  assert.throws(() =>
    databaseFromCompose({
      services: {
        db: {},
        api: {
          environment: {
            DATABASE_URL: "postgres://private:secret@external.example/hikmah",
          },
        },
      },
    }),
  );
});
test("Client connection failures and HTML gateway errors are readable and do not expire a valid session; explicit 401 still does", async () => {
  const original = globalThis.fetch;
  let ended = false;
  const request = createClient("", undefined, () => {
    ended = true;
  });
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(
      request("/v1/me"),
      (e: any) =>
        e instanceof ApiError &&
        e.status === 0 &&
        e.message.includes("Cannot reach"),
    );
    assert(!ended);
    globalThis.fetch = async () =>
      new Response("<html>gateway down</html>", { status: 502 });
    await assert.rejects(
      request("/v1/me"),
      (e: any) => e.status === 502 && !e.message.includes("<html>"),
    );
    assert(!ended);
    globalThis.fetch = async () => new Response("broken json", { status: 200 });
    await assert.rejects(request("/v1/me"), (e: any) => e.status === 502);
    assert(!ended);
    globalThis.fetch = async () =>
      new Response("busy", { status: 429, headers: { "Retry-After": "30" } });
    await assert.rejects(
      request("/v1/me"),
      (e: any) => e.status === 429 && e.retryAfter === 30,
    );
    globalThis.fetch = async () => new Response("denied", { status: 401 });
    await assert.rejects(request("/v1/me"));
    assert(ended);
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = async () => {
      throw new DOMException("aborted", "AbortError");
    };
    await assert.rejects(
      request("/v1/me", { signal: controller.signal }),
      (e: any) => e.name === "AbortError",
    );
  } finally {
    globalThis.fetch = original;
  }
});
