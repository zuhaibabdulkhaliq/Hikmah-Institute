import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pool } from "../apps/api/src/db.ts";
const db = await pool.connect();
try {
  await db.query("SELECT pg_advisory_lock(1448)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const raw = await readFile(`db/migrations/${name}`, "utf8");
    const checksum = createHash("sha256").update(raw).digest("hex");
    const applied = await db.query(
      "SELECT checksum FROM schema_migrations WHERE name=$1",
      [name],
    );
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum)
        throw new Error(`Changed migration: ${name}`);
      continue;
    }
    await db.query("BEGIN");
    try {
      await db.query(
        raw.replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, ""),
      );
      await db.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
      await db.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await db.query("SELECT pg_advisory_unlock(1448)");
  db.release();
  await pool.end();
}
