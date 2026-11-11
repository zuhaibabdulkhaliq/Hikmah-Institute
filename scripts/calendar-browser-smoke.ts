import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
await mkdir(".data/screenshots", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
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
  async function request(
    path: string,
    method = "GET",
    data?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await page.request.fetch(new URL(path, base).toString(), {
      method,
      data,
      headers: { origin: base, ...headers },
    });
    expect(
      response.ok(),
      `${method} ${path}: ${response.status()}`,
    ).toBeTruthy();
    return response.json();
  }
  const me = await request("/v1/me");
  const date = (offset: number) =>
    new Date(Date.parse(me.today) + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  const programs = await request("/v1/programs"),
    levels = await request("/v1/levels");
  const evening = programs.find((p: any) => p.code === "EVENING"),
    morning = programs.find((p: any) => p.code === "MORNING");
  const year = await request("/v1/academic-years", "POST", {
    label: `Calendar demo ${me.today.slice(0, 4)} (${randomUUID().slice(0, 6)})`,
    start_date: date(-60),
    end_date: date(365),
    state: "ACTIVE",
  });
  const targets = [];
  for (const [level, program, code] of [
    [5, evening, "S4"],
    [4, evening, "S3"],
    [5, morning, "M4"],
  ] as const) {
    targets.push(
      await request("/v1/sections", "POST", {
        academic_year_id: year.id,
        program_id: program.id,
        level_id: levels.find((l: any) => l.ordinal === level).id,
        code,
        name: `Synthetic ${code}`,
      }),
    );
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Academic calendar", exact: true })
    .click();
  await page.getByLabel("Academic year", { exact: true }).selectOption(year.id);
  const from = page.getByLabel("Effective from", { exact: true }),
    through = page.getByLabel("Through", { exact: true });
  async function filter(program: string, level: string) {
    await page.getByLabel("Program", { exact: true }).selectOption(program);
    await page.getByLabel("Class level", { exact: true }).selectOption(level);
    await expect(
      page.getByLabel("View section", { exact: true }).locator("option"),
    ).toHaveCount(1);
  }
  async function save() {
    await page
      .getByRole("button", { name: "Preview changes", exact: true })
      .click();
    const preview = page.getByRole("region", {
      name: "Calendar change preview",
    });
    await expect(preview).toBeVisible();
    const applyButton = preview.getByRole("button", { name: /^Apply to / });
    const acknowledgement = preview.getByRole("checkbox", {
      name: /^I reviewed the /,
    });
    if (await acknowledgement.count()) {
      await expect(applyButton).toBeDisabled();
      await acknowledgement.check();
    }
    await applyButton.click();
    await expect(
      page.getByRole("status").filter({ hasText: /Calendar updated for/ }),
    ).toBeVisible();
    await expect(preview).toHaveCount(0);
    await expect(
      page.getByText("Loading calendar…", { exact: true }),
    ).toHaveCount(0);
  }
  await filter(evening.id, targets[0].level_id);
  await page
    .getByRole("button", { name: "Clear weekdays", exact: true })
    .click();
  for (const day of ["Monday", "Tuesday", "Thursday", "Saturday"])
    await page.getByRole("checkbox", { name: day, exact: true }).check();
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Confirmed Shaam level four timetable");
  await save();
  await filter(evening.id, targets[1].level_id);
  await page
    .getByRole("button", { name: "Clear weekdays", exact: true })
    .click();
  for (const day of ["Monday", "Wednesday", "Thursday", "Saturday"])
    await page.getByRole("checkbox", { name: day, exact: true }).check();
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Confirmed Shaam level three timetable");
  await save();
  await filter(morning.id, targets[2].level_id);
  await page
    .getByRole("button", { name: "All seven days", exact: true })
    .click();
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Morning seven-day teaching week");
  await save();
  // One shared vacation applied to exactly the three filtered year sections.
  const student = await request("/v1/students", "POST", {
    student_number: `CAL-BROWSER-${randomUUID()}`,
    full_name: "Synthetic calendar browser learner",
  });
  const enrollment = await request(
    `/v1/sections/${targets[2].id}/enrollments`,
    "POST",
    {
      student_id: student.id,
      roll_number: "1",
      joined_on: year.start_date.slice(0, 10),
    },
  );
  await request(
    `/v1/sections/${targets[2].id}/attendance/${date(0)}`,
    "PUT",
    { records: [{ enrollmentId: enrollment.id, status: "PRESENT" }] },
    { "if-match": "0" },
  );
  await request(
    `/v1/sections/${targets[2].id}/attendance/${date(0)}/submit`,
    "POST",
    {},
    { "if-match": "1" },
  );
  await page.getByLabel("Program", { exact: true }).selectOption("");
  await page.getByLabel("Class level", { exact: true }).selectOption("");
  await expect(
    page.getByLabel("View section", { exact: true }).locator("option"),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Holiday / extra day", exact: true })
    .click();
  await from.fill(date(0));
  await through.fill(date(2));
  await page
    .getByLabel("Holiday or exception name", { exact: true })
    .fill("Shared institute vacation");
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Vacation for all three test classes");
  await save();
  for (const s of targets) {
    const c = await request(
      `/v1/sections/${s.id}/academic-calendar?from=${date(0)}&through=${date(2)}`,
    );
    expect(
      c.days.every(
        (d: any) => d.source === "EXCEPTION" && !d.countsForAttendance,
      ),
    ).toBeTruthy();
  }
  const retained = await request(
    `/v1/sections/${targets[2].id}/attendance/${date(0)}`,
  );
  expect(retained.records[0].status).toBe("PRESENT");
  expect(retained.status).toBe("SUBMITTED");
  // Editing a schedule keeps vacation dates; changing the form invalidates preview.
  await filter(evening.id, targets[0].level_id);
  await page
    .getByRole("button", { name: "Weekly schedule", exact: true })
    .click();
  await from.fill(date(0));
  await through.fill(year.end_date.slice(0, 10));
  await page.getByLabel("Copy a saved schedule", { exact: true }).selectOption({
    label: (
      await page
        .getByLabel("Copy a saved schedule", { exact: true })
        .locator("option")
        .allTextContents()
    ).find((label: string) => label.includes("M4:"))!,
  });
  await expect(
    page
      .getByRole("group", { name: "Teaching weekdays" })
      .getByRole("checkbox", { checked: true }),
  ).toHaveCount(7);
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Copy morning week to revised seasonal timetable");
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Calendar change preview" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Sunday", exact: true }).uncheck();
  await expect(
    page.getByRole("region", { name: "Calendar change preview" }),
  ).toHaveCount(0);
  await save();
  const updated = await request(
    `/v1/sections/${targets[0].id}/academic-calendar?from=${date(-1)}&through=${date(2)}`,
  );
  expect(updated.patterns).toHaveLength(2);
  expect(
    updated.days.filter((d: any) => d.source === "EXCEPTION"),
  ).toHaveLength(3);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: ".data/screenshots/academic-calendar-desktop.png",
    fullPage: true,
  });
  for (const width of [1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const sizes = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(sizes.page, `Calendar overflow at ${width}px`).toBeLessThanOrEqual(
      sizes.viewport + 1,
    );
    if (width === 820 || width === 390)
      await page.screenshot({
        path: `.data/screenshots/academic-calendar-${width}.png`,
        fullPage: true,
      });
  }
  await page
    .getByRole("button", { name: "Restore schedule", exact: true })
    .click();
  await from.fill(date(0));
  await through.fill(date(2));
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Restore the selected class weekly timetable");
  await save();
  const restored = await request(
    `/v1/sections/${targets[0].id}/academic-calendar?from=${date(0)}&through=${date(2)}`,
  );
  expect(restored.days.every((d: any) => d.source === "WEEKLY")).toBeTruthy();
  // Retain the synthetic test's history but keep it separate from active demo classes.
  await request(`/v1/academic-years/${year.id}`, "PATCH", {
    state: "ARCHIVED",
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS: calendar filters, distinct Shaam/Sabah weeks, seven-day week, bulk vacation, copied seasonal schedule, preserved exceptions, stale form preview, restore, and responsive layouts at 1440/1024/820/768/390/320px.",
  );
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({
      path: ".data/screenshots/calendar-error.png",
      fullPage: true,
    });
    console.log(
      "Calendar debug headings:",
      await page.locator("h1,h2,[role=alert]").allTextContents(),
    );
    console.log(
      "Calendar debug selects:",
      await page.locator("select").evaluateAll((elements) =>
        elements.map((element) => ({
          label: element.closest("label")?.textContent?.slice(0, 150),
          value: (element as HTMLSelectElement).value,
        })),
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
}
