import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { pool } from "../apps/api/src/db.ts";
const name = "hikmah_test_" + randomBytes(6).toString("hex");
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/" + name;
async function run(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(process.execPath, ["--import", "tsx", ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
      },
    });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command failed: ${args.join(" ")} (${code})`)),
    );
  });
}
try {
  await pool.query(`CREATE DATABASE ${name}`);
  await run(["scripts/migrate.ts"]);
  await run(["scripts/seed.ts"]);
  await run(["--test", "tests/domain.test.ts", "tests/api.test.ts"]);
} finally {
  await pool.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await pool.end();
}
