import "dotenv/config";
import { chromium, expect } from "@playwright/test";
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
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  await page.goto(process.env.SMOKE_BASE_URL ?? "http://localhost:3000");
  const email = page.getByRole("textbox", { name: "Email address" });
  await email.waitFor();
  await page.screenshot({
    path: ".data/screenshots/login-desktop.png",
    fullPage: true,
  });
  await email.fill("admin@hikmah.example");
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
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Attendance", exact: true })
    .click();
  await page.getByRole("heading", { name: "Daily attendance" }).waitFor();
  const totals = page.getByText(
    "Attendance totals · academic year and exam sessions",
    { exact: true },
  );
  await totals.click();
  await expect(
    page.getByRole("columnheader", { name: "Half", exact: true }),
  ).toBeVisible();
  await totals.click();

  await page.getByText("Student A", { exact: true }).first().waitFor();
  await page.screenshot({
    path: ".data/screenshots/attendance.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Results & reports", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await page.getByText("513 / 600", { exact: true }).first().waitFor();
  await page.screenshot({
    path: ".data/screenshots/preflight.png",
    fullPage: true,
  });
  const individual = page.getByRole("link", {
    name: "Download student report PDF",
    exact: true,
  });
  const href = await individual.getAttribute("href");
  if (!href) throw new Error("Missing performance PDF link");
  const pdf = await page.request.get(new URL(href, page.url()).toString());
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Marks entry", exact: true })
    .click();
  const examLeave = page.getByRole("checkbox", {
      name: "Exam leave SYN-001",
      exact: true,
    }),
    onTime = page.getByRole("checkbox", {
      name: "Given on time SYN-001",
      exact: true,
    });
  await examLeave.uncheck();
  await onTime.check();
  await examLeave.check();
  await expect(onTime).not.toBeChecked();
  await expect(onTime).toBeDisabled();
  await page
    .getByLabel("Mark state SYN-001", { exact: true })
    .selectOption("PENDING");
  await page
    .getByLabel("Mark state SYN-001", { exact: true })
    .selectOption("GRADED");
  await expect(page.getByLabel("Awarded SYN-001", { exact: true })).toHaveValue(
    "",
  );

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Policies", exact: true })
    .click();
  await page.getByText("Advanced policy data", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Academic policy", exact: true })
    .waitFor();
  const views = await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button")
    .allTextContents();
  for (const width of [1440, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 1000 });
    for (const label of views) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: label.trim(), exact: true })
        .click();
      await page
        .getByRole("heading", {
          level: 1,
          name:
            label.trim() === "Overview"
              ? "A clear view of your institute"
              : label.trim(),
          exact: true,
        })
        .waitFor();
      await page.waitForLoadState("networkidle");
      const dimensions = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      if (dimensions.page > dimensions.viewport + 1)
        throw new Error(
          `Page overflow at ${width}px on ${label}: ${JSON.stringify(dimensions)}`,
        );
      if (width === 820 && label.trim() === "Overview")
        await page.screenshot({
          path: ".data/screenshots/ipad-overview.png",
          fullPage: true,
        });
      if (
        width === 390 &&
        ["Overview", "Attendance", "People & access"].includes(label.trim())
      ) {
        await page.screenshot({
          path: `.data/screenshots/mobile-${label
            .trim()
            .toLowerCase()
            .replaceAll(/[^a-z]+/g, "-")}.png`,
          fullPage: true,
        });
      }
    }
  }
  await page.goto(process.env.SMOKE_BASE_URL ?? "http://localhost:3000");
  await page
    .getByRole("heading", { name: "A clear view of your institute" })
    .waitFor();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("ameer@hikmah.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "A clear view of your institute" })
    .waitFor();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "People & access", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText([
    "Overview",
    "Attendance",
  ]);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Attendance", exact: true })
    .click();
  await page.getByText("Student A", { exact: true }).first().waitFor();
  await expect(
    page.getByLabel("Section", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await expect(
    page.getByText("Build academic calendar & holidays", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("mushrif@hikmah.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "A clear view of your institute" })
    .waitFor();
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText([
    "Overview",
    "Attendance",
    "Exams & schemes",
    "Marks entry",
    "Results & reports",
  ]);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Marks entry", exact: true })
    .click();
  await page.getByLabel("Paper", { exact: true }).waitFor();
  await expect(
    page.getByLabel("Paper", { exact: true }).locator("option"),
  ).toHaveCount(11);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Results & reports", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Student performance & history" })
    .waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("subject@hikmah.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "A clear view of your institute" })
    .waitFor();
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText([
    "Overview",
    "Marks entry",
  ]);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Marks entry", exact: true })
    .click();
  await expect(
    page.getByLabel("Paper", { exact: true }).locator("option"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await page.screenshot({
    path: ".data/screenshots/login-mobile.png",
    fullPage: true,
  });
  await page.goto(
    `${process.env.SMOKE_BASE_URL ?? "http://localhost:3000"}/activate`,
  );
  await page.getByRole("heading", { name: "Make it yours." }).waitFor();
  await page.screenshot({
    path: ".data/screenshots/activate-mobile.png",
    fullPage: true,
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "PASS: login, attendance, raw results, policies, all 10 views at 1440/1024/820/768/390/320px without page overflow, keyboard skip link, Ameer/Mushrif/subject-teacher navigation and scoped re-login, sign-out and activation. Screenshots in .data/screenshots.",
  );
} finally {
  await browser.close();
}
