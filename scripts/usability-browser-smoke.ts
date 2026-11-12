import { chromium, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

if (process.env.SMOKE_DISPOSABLE !== "1")
  throw new Error(
    "Run this write-based browser check only on a disposable test installation, with SMOKE_DISPOSABLE=1.",
  );
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
});
await mkdir(".data/screenshots", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("admin@hikmah.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Find a class", { exact: true })).toBeVisible();
  const request = async (path: string, method = "GET", data?: unknown) => {
    const r = await page.request.fetch(base + path, {
      method,
      data,
      headers: { origin: base },
    });
    if (!r.ok())
      throw new Error(`${method} ${path}: ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const me = await request("/v1/me");
  const seed = (await request("/v1/sections")).find(
    (s: any) => s.year_label === "1448 synthetic" && s.code === "A",
  );
  const sourceCycle = (await request("/v1/exam-cycles")).find(
    (c: any) =>
      c.academic_year_id === seed.academic_year_id && c.code === "SHASH_MAHI",
  );
  const source = (
    await request(
      `/v1/exam-cycles/${sourceCycle.id}/sections/${seed.id}/scheme`,
    )
  ).scheme;
  const offerings = await request(`/v1/sections/${seed.id}/subjects`);
  const name = `Usability review ${randomUUID().slice(0, 8)}`;
  const year = await request("/v1/academic-years", "POST", {
    label: name,
    start_date: `${me.today.slice(0, 4)}-01-01`,
    end_date: `${me.today.slice(0, 4)}-12-31`,
    state: "ACTIVE",
  });
  const section = await request("/v1/sections", "POST", {
    academic_year_id: year.id,
    program_id: seed.program_id,
    level_id: seed.level_id,
    code: "UX",
    name,
  });
  const cycle = (await request("/v1/exam-cycles")).find(
    (c: any) => c.academic_year_id === year.id && c.code === "SHASH_MAHI",
  );
  const papers = [];
  for (const p of source.papers) {
    const offering = await request(
      `/v1/sections/${section.id}/subjects`,
      "POST",
      {
        subject_id: offerings.find((o: any) => o.id === p.offeringId)
          .subject_id,
      },
    );
    papers.push({
      code: p.code,
      label: p.label,
      max: p.max,
      type: p.type,
      pattern: p.pattern,
      offeringId: offering.id,
      date: null,
    });
  }
  const schemePath = `/v1/exam-cycles/${cycle.id}/sections/${section.id}/scheme`;
  await request(schemePath, "PUT", { papers, groups: source.groups });
  const student = await request("/v1/students", "POST", {
    student_number: `UX-${randomUUID()}`,
    full_name: "Synthetic usability learner",
  });
  await request(`/v1/sections/${section.id}/enrollments`, "POST", {
    student_id: student.id,
    roll_number: "01",
    joined_on: `${me.today.slice(0, 4)}-01-01`,
  });
  await page.reload();
  await page.getByLabel("Find a class", { exact: true }).fill(name);
  await expect(page.locator(".overview-class")).toHaveCount(1);
  await page
    .getByLabel("Find a class", { exact: true })
    .fill("No class exists with this text");
  await expect(
    page.getByText(
      "No matching classes. Try another search or include previous years.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("Find a class", { exact: true }).fill("");
  await expect(page.locator(".overview-class")).not.toHaveCount(0);

  await page.route("**/v1/me", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<html>Gateway unavailable</html>",
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".workspace-feedback[role=alert]")).toContainText(
    "server is temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await expect(page.locator(".workspace-feedback")).toHaveCount(0);
  await page.unroute("**/v1/me");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: "Marks entry", exact: true }).click();
  const assessments = await request("/v1/assessments");
  const a = assessments.find(
    (p: any) => p.section_id === section.id && p.paper_code === "P01",
  );
  const b = assessments.find(
    (p: any) => p.section_id === section.id && p.paper_code === "P02",
  );
  const paper = page.getByLabel("Paper", { exact: true });
  await expect(paper).toBeEnabled();
  await paper.selectOption(a.id);
  await expect(
    page.getByText("Approve the paper scheme before entering marks.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save marks", exact: true }),
  ).toBeDisabled();
  await expect(paper.locator(`option[value="${a.id}"]`)).toContainText(name);
  await request(schemePath + "/approve", "POST", {});
  await expect(paper).toBeEnabled();
  await paper.selectOption(b.id);
  await expect(
    page.getByRole("button", { name: "Save marks", exact: true }),
  ).toBeEnabled();
  await paper.selectOption(a.id);
  const state = page.getByLabel(`Mark state ${student.student_number}`, {
    exact: true,
  });
  await expect(state).toBeEnabled();
  await state.selectOption("GRADED");
  await page
    .getByLabel(`Awarded ${student.student_number}`, { exact: true })
    .fill("20");
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText(
    "Marks saved.",
  );
  const toast = await page.locator(".workspace-feedback").boundingBox();
  expect(toast && toast.y >= 0 && toast.y + toast.height <= 950).toBeTruthy();
  await page.getByRole("button", { name: "Submit paper", exact: true }).click();
  await expect(
    page.getByText(
      "This paper is submitted. A Mushrif or administrator can reopen it with a correction reason.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(state).toBeDisabled();
  await page
    .getByPlaceholder("Correction reason", { exact: true })
    .fill("Synthetic browser correction review");
  await page.getByRole("button", { name: "Reopen paper", exact: true }).click();
  await expect(state).toBeEnabled();
  await page
    .getByText("Import assigned-paper marks from CSV", { exact: true })
    .click();
  await page
    .getByLabel("Marks CSV", { exact: true })
    .fill(`student_number,P01\n${student.student_number},21\n`);
  await page
    .getByLabel("Change or import reason", { exact: true })
    .fill("Synthetic browser import review");
  await page
    .getByRole("button", { name: "Preview marks import", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply previewed marks", exact: true }),
  ).toBeEnabled();
  await paper.selectOption(b.id);
  await expect(
    page.getByRole("button", { name: "Apply previewed marks", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Marks CSV", { exact: true })).toHaveValue("");
  await request(`/v1/academic-years/${year.id}`, "PATCH", { state: "CLOSED" });
  await page.reload();
  await page.getByLabel("Find a class", { exact: true }).fill(name);
  await expect(page.locator(".overview-class")).toHaveCount(0);
  await page.getByLabel("Include previous years", { exact: true }).check();
  await expect(page.locator(".overview-class")).toHaveCount(1);
  await page.screenshot({
    path: ".data/screenshots/usability-class-search.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS: class search/history, recoverable gateway errors, session preservation, visible feedback, contextual papers, scheme/submission locks, reviewed reopen and CSV preview invalidation.",
  );
} catch (error) {
  await page.screenshot({
    path: ".data/screenshots/usability-error.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
