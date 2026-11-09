import "dotenv/config";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
await mkdir(".data/screenshots", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.SMOKE_BASE_URL ?? "http://localhost:3000");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("admin@hikmah.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "A clear view of your institute" })
    .waitFor();
  await page.screenshot({
    path: ".data/screenshots/dashboard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Attendance", exact: true }).click();
  await page.getByRole("heading", { name: "Daily attendance" }).waitFor();
  await page.getByText("Student A", { exact: true }).waitFor();
  await page.screenshot({
    path: ".data/screenshots/attendance.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Results & reports", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await page.getByText("513 / 600", { exact: true }).waitFor();
  await page.screenshot({
    path: ".data/screenshots/preflight.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Policies", exact: true }).click();
  await page.getByText("Advanced policy data", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Academic policy", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "PASS: real browser login, dashboard, 20-learner attendance roster, raw result preview, policy setup and sign-out. Screenshots in .data/screenshots.",
  );
} finally {
  await browser.close();
}
