/** Authenticated, streaming backup format. Runs with Node 24; no packages needed. */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  type DecipherGCM,
} from "node:crypto";
import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const magic = Buffer.from("HIKMAH-BACKUP-1\n");
const headerLength = magic.length + 32 + 12;
async function key(password: Uint8Array, salt: Buffer) {
  if (password.length < 32 || password.length > 4096)
    throw new Error(
      "Use a private backup key of 32–4096 bytes. Generate it with openssl rand -hex 32.",
    );
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
}
export async function encryptBackup(
  input: Readable,
  output: Writable,
  password: Uint8Array,
) {
  const salt = randomBytes(32),
    iv = randomBytes(12),
    secret = await key(password, salt);
  const header = Buffer.concat([magic, salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  cipher.setAAD(header);
  try {
    async function* chunks() {
      yield header;
      for await (const chunk of input) yield cipher.update(chunk);
      yield cipher.final();
      yield cipher.getAuthTag();
    }
    await pipeline(Readable.from(chunks()), output);
  } finally {
    secret.fill(0);
  }
}
export async function decryptBackup(
  input: Readable,
  output: Writable,
  password: Uint8Array,
) {
  const dir = await mkdtemp(join(tmpdir(), "hikmah-restore-"));
  const file = join(dir, "authenticated.dump");
  let secret: Buffer | undefined;
  try {
    async function* chunks() {
      let header = Buffer.alloc(0),
        tail = Buffer.alloc(0);
      let cipher: DecipherGCM | undefined;
      for await (const raw of input) {
        let chunk = Buffer.from(raw);
        if (!cipher) {
          const needed = headerLength - header.length;
          header = Buffer.concat([header, chunk.subarray(0, needed)]);
          chunk = chunk.subarray(needed);
          if (header.length < headerLength) continue;
          if (!header.subarray(0, magic.length).equals(magic))
            throw new Error(
              "Unsupported backup format. Use an authenticated Hikmah backup from data-backup.sh.",
            );
          secret = await key(
            password,
            header.subarray(magic.length, magic.length + 32),
          );
          cipher = createDecipheriv(
            "aes-256-gcm",
            secret,
            header.subarray(-12),
          );
          cipher.setAAD(header);
        }
        const body = Buffer.concat([tail, chunk]);
        const length = Math.max(0, body.length - 16);
        if (length) yield cipher.update(body.subarray(0, length));
        tail = body.subarray(length);
      }
      if (!cipher || tail.length !== 16)
        throw new Error("Backup is truncated or incomplete.");
      cipher.setAuthTag(tail);
      try {
        yield cipher.final();
      } catch {
        throw new Error(
          "Backup authentication failed. The key is wrong or the file changed. No data was released for restore.",
        );
      }
    }
    // pg_restore receives no bytes until the ENTIRE archive authenticates.
    await pipeline(
      Readable.from(chunks()),
      createWriteStream(file, { flags: "wx", mode: 0o600 }),
    );
    await pipeline(createReadStream(file), output);
  } finally {
    secret?.fill(0);
    await rm(dir, { recursive: true, force: true });
  }
}
export function databaseFromCompose(config: any): string {
  if (!config.services?.db)
    throw new Error(
      "This target has no local PostgreSQL service. Use your managed-provider recovery tools.",
    );
  let database = config.services.db.environment?.POSTGRES_DB;
  const connection = config.services.api?.environment?.DATABASE_URL;
  if (connection) {
    try {
      const url = new URL(connection);
      if (url.hostname !== "db") throw new Error();
      database = decodeURIComponent(url.pathname.slice(1));
    } catch {
      throw new Error(
        "The selected API does not use the selected local database service. Use the matching backup target.",
      );
    }
  }
  if (
    typeof database !== "string" ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)
  )
    throw new Error(
      "The selected database must have an explicit standard name.",
    );
  return database;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let password: Buffer | undefined;
  try {
    if (process.argv[2] === "database") {
      let input = "";
      for await (const chunk of process.stdin) {
        input += chunk.toString();
        if (input.length > 1024 * 1024)
          throw new Error("Unexpected backup configuration size.");
      }
      let config: unknown;
      try {
        config = JSON.parse(input);
      } catch {
        throw new Error("Cannot read the selected Compose configuration.");
      }
      process.stdout.write(databaseFromCompose(config));
    } else {
      const keyPath = process.env.BACKUP_KEY_FILE ?? "/run/backup-key";
      const info = await stat(keyPath);
      if (!info.isFile() || info.size > 4098)
        throw new Error(
          "Choose a private backup key file of at most 4096 bytes.",
        );
      password = await readFile(keyPath);
      if (password.at(-1) === 10)
        password = password.subarray(0, password.at(-2) === 13 ? -2 : -1);
      if (process.argv[2] === "encrypt")
        await encryptBackup(process.stdin, process.stdout, password);
      else if (process.argv[2] === "decrypt")
        await decryptBackup(process.stdin, process.stdout, password);
      else throw new Error("Expected encrypt, decrypt or database.");
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    password?.fill(0);
  }
}
