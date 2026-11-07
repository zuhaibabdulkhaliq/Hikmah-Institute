import { writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
try {
  await access(".env");
  console.log("Existing .env preserved.");
} catch {
  await writeFile(
    ".env",
    `DATABASE_URL=postgres://hikmah:hikmah_local_only@127.0.0.1:5432/hikmah\nBETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\nBETTER_AUTH_URL=http://localhost:3001\nWEB_ORIGIN=http://localhost:3000\nDEMO_PASSWORD=${randomBytes(18).toString("base64url")}\nPDF_PYTHON=python3\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created .env with random local credentials. Read DEMO_PASSWORD locally to sign in.",
  );
}
