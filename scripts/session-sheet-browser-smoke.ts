import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { sheetCSV } from "../packages/domain/src/index.ts";
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
await mkdir(".data/screenshots", { recursive: true });
await mkdir(".data/reports", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("admin@hikmah.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "A clear view of your institute" })
    .waitFor();
  async function request(path: string, method = "GET", data?: unknown) {
    const r = await page.request.fetch(new URL(path, base).toString(), {
      method,
      data,
      headers: { origin: base },
    });
    expect(r.ok(), `${method} ${path}: ${r.status()}`).toBeTruthy();
    return r.json();
  }
  const me = await request("/v1/me"),
    date = (n: number) =>
      new Date(Date.parse(me.today) + n * 86400000).toISOString().slice(0, 10);
  const sections = await request("/v1/sections"),
    seed = sections.find(
      (s: any) => s.year_label === "1448 synthetic" && s.code === "A",
    );
  const cycles = await request("/v1/exam-cycles"),
    seedCycle = cycles.find(
      (c: any) =>
        c.academic_year_id === seed.academic_year_id && c.code === "SHASH_MAHI",
    );
  const source = (
    await request(`/v1/exam-cycles/${seedCycle.id}/sections/${seed.id}/scheme`)
  ).scheme;
  const sourceOfferings = await request(`/v1/sections/${seed.id}/subjects`);
  const year = await request("/v1/academic-years", "POST", {
    label: `CSV demo ${me.today.slice(0, 4)} (${randomUUID().slice(0, 6)})`,
    hijri_label: "1448 — synthetic",
    start_date: date(-365),
    end_date: date(120),
    state: "ACTIVE",
  });
  const section = await request("/v1/sections", "POST", {
    academic_year_id: year.id,
    program_id: seed.program_id,
    level_id: seed.level_id,
    code: "CSV",
    name: "Synthetic CSV class",
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
        subject_id: sourceOfferings.find((o: any) => o.id === p.offeringId)
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
  const path = `/v1/exam-cycles/${cycle.id}/sections/${section.id}`;
  await request(path + "/scheme", "PUT", { papers, groups: source.groups });
  await request(path + "/scheme/approve", "POST", {});
  for (let i = 0; i < 10; i++) {
    const s = await request("/v1/students", "POST", {
      student_number: `CSV-DEMO-${randomUUID()}`,
      full_name: `Synthetic CSV learner ${i + 1}`,
      full_name_ur: `مصنوعی طالب علم ${i + 1}`,
    });
    await request(`/v1/sections/${section.id}/enrollments`, "POST", {
      student_id: s.id,
      roll_number: String(i + 1),
      joined_on: date(-365),
    });
  }
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Results & reports", exact: true })
    .click();
  await page.getByLabel("Section", { exact: true }).selectOption(section.id);
  await page.getByLabel("Exam cycle", { exact: true }).selectOption(cycle.id);
  const panel = page.getByRole("region", {
    name: "Session results sheet",
    exact: true,
  });
  await expect(panel.getByRole("table")).toBeVisible();
  await panel
    .getByRole("checkbox", { name: "Include exam leave and on-time columns" })
    .check();
  const download = await Promise.all([
    page.waitForEvent("download"),
    panel
      .getByRole("link", { name: "Download blank marks CSV", exact: true })
      .click(),
  ]).then(([d]) => d);
  await download.saveAs(".data/reports/session-marks-template.csv");
  const rows = parse(
    await readFile(".data/reports/session-marks-template.csv", "utf8"),
    { bom: true, relax_column_count: true },
  ) as string[][];
  expect(rows).toHaveLength(17);
  expect(rows[6][4]).toContain("P01");
  expect(rows[6][5]).toContain("P02");
  const sample = [30, 31, 27, 28, 55, 88, 61, 30, 24, 58, 81],
    flag = 4 + papers.length + 4;
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < papers.length; j++) {
      rows[i + 7][j + 4] = String(Math.max(0, sample[j] - i));
      rows[i + 7][flag + j * 2 + 1] = "YES";
    }
  rows[8][4] = "0";
  rows[9][flag] = "YES";
  rows[9][flag + 1] = "NO";
  // Spreadsheet editors pad the short reference rows to the table's full width.
  const correct = structuredClone(rows).map((row) => [
    ...row,
    ...Array(rows[6].length - row.length).fill(""),
  ]);
  correct.push(Array(rows[6].length).fill(""));
  rows[7][4] = "999";
  const file = panel.getByLabel("Completed marks CSV", { exact: true });
  await file.setInputFiles({
    name: "invalid-marks.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheetCSV(rows)),
  });
  const upload = panel.locator(".session-import");
  await upload
    .getByRole("button", { name: "Validate uploaded CSV", exact: true })
    .click();
  await expect(upload.getByRole("alert")).toHaveText(
    "Enter a reason of at least five characters.",
  );
  await expect(upload.getByRole("alert")).toBeInViewport();
  await panel
    .getByLabel("Import reason", { exact: true })
    .fill("Reviewed synthetic class marks entry");
  const changedReference = structuredClone(correct);
  changedReference[1][1] = "Changed protected institute reference";
  await file.setInputFiles({
    name: "changed-reference.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheetCSV(changedReference)),
  });
  await upload
    .getByRole("button", { name: "Validate uploaded CSV", exact: true })
    .click();
  await expect(upload.getByRole("alert")).toContainText(
    "reference rows changed",
  );
  await expect(upload.getByRole("alert")).toBeInViewport();
  await file.setInputFiles({
    name: "invalid-marks.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheetCSV(rows)),
  });
  await panel
    .getByRole("button", { name: "Validate uploaded CSV", exact: true })
    .click();
  const preview = panel.getByRole("region", {
    name: "Marks import preview",
    exact: true,
  });
  await expect(preview).toContainText("Marks must be between 0 and 33");
  await expect(preview).toBeFocused();
  await expect(
    preview.getByRole("button", { name: "Apply validated marks", exact: true }),
  ).toBeDisabled();
  const errorsDownload = await Promise.all([
    page.waitForEvent("download"),
    preview
      .getByRole("button", {
        name: "Download validation errors CSV",
        exact: true,
      })
      .click(),
  ]).then(([d]) => d);
  await errorsDownload.saveAs(".data/reports/session-marks-errors.csv");
  await file.setInputFiles({
    name: "reviewed-marks.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheetCSV(correct)),
  });
  await expect(preview).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Validate uploaded CSV", exact: true })
    .click();
  await expect(preview).toContainText("99 changed entries");
  await expect(preview).toBeFocused();
  await preview
    .getByRole("button", { name: "Apply validated marks", exact: true })
    .click();
  await expect(
    panel
      .getByRole("status")
      .filter({ hasText: "99 mark entries saved together" }),
  ).toBeVisible();
  await expect(panel.locator(".session-sheet-table tbody tr")).toHaveCount(10);
  await expect(
    panel.locator(".session-sheet-table tbody tr").first(),
  ).toContainText("513");
  await expect(
    panel.locator(".session-sheet-table tbody tr").first(),
  ).toContainText("85.5");
  await expect(
    panel
      .locator(".session-sheet-table tbody tr")
      .last()
      .locator(".unresolved"),
  ).toHaveCount(11);
  const pdfDownload = await Promise.all([
    page.waitForEvent("download"),
    panel
      .getByRole("link", { name: "Download session sheet PDF", exact: true })
      .click(),
  ]).then(([d]) => d);
  await pdfDownload.saveAs(".data/reports/session-sheet-browser-draft.pdf");
  expect(
    (await readFile(".data/reports/session-sheet-browser-draft.pdf"))
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
  const csvDownload = await Promise.all([
    page.waitForEvent("download"),
    panel
      .getByRole("link", { name: "Download session sheet CSV", exact: true })
      .click(),
  ]).then(([d]) => d);
  await csvDownload.saveAs(".data/reports/session-sheet-browser-results.csv");
  const output = parse(
    await readFile(".data/reports/session-sheet-browser-results.csv", "utf8"),
    { bom: true, relax_column_count: true },
  );
  expect(output[7][15]).toBe("513");
  expect(output[6][14]).toContain("P11");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: ".data/screenshots/session-results-desktop.png",
    fullPage: true,
  });
  for (const width of [1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const size = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(
      size.page,
      `Session sheet overflow at ${width}px`,
    ).toBeLessThanOrEqual(size.viewport + 1);
    const identityVisible = await panel
      .locator(".session-sheet-scroll")
      .evaluate((el) => {
        const name = el
          .querySelector("tbody .student-name")!
          .getBoundingClientRect();
        const bounds = el.getBoundingClientRect();
        return name.left >= bounds.left - 1 && name.right <= bounds.right + 1;
      });
    expect(
      identityVisible,
      `Student identity must stay visible at ${width}px`,
    ).toBeTruthy();
    if (width === 820 || width === 390)
      await page.screenshot({
        path: `.data/screenshots/session-results-${width}.png`,
        fullPage: true,
      });
  }
  const freshDownload = await Promise.all([
    page.waitForEvent("download"),
    panel
      .getByRole("link", { name: "Download blank marks CSV", exact: true })
      .click(),
  ]).then(([d]) => d);
  await freshDownload.saveAs(
    ".data/reports/session-marks-correction-template.csv",
  );
  const fresh = parse(
    await readFile(
      ".data/reports/session-marks-correction-template.csv",
      "utf8",
    ),
    { bom: true, relax_column_count: true },
  );
  fresh[7][4] = "29";
  await file.setInputFiles({
    name: "correction.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheetCSV(fresh)),
  });
  await panel
    .getByRole("button", { name: "Validate uploaded CSV", exact: true })
    .click();
  await expect(preview).toContainText("1 existing entries replaced");
  await expect(
    preview.getByRole("button", { name: "Apply validated marks", exact: true }),
  ).toBeDisabled();
  await preview
    .getByRole("checkbox", { name: /I reviewed and approve replacing/ })
    .check();
  await preview
    .getByRole("button", { name: "Apply validated marks", exact: true })
    .click();
  await expect(
    panel
      .getByRole("status")
      .filter({ hasText: "1 mark entries saved together" }),
  ).toBeVisible();
  await expect(
    panel.locator(".session-sheet-table tbody tr").first(),
  ).toContainText("512");
  expect(errors).toEqual([]);
  await request(`/v1/academic-years/${year.id}`, "PATCH", {
    state: "ARCHIVED",
  });
  await writeFile(
    ".data/reports/session-sheet-browser-fixture.json",
    JSON.stringify(
      { yearId: year.id, sectionId: section.id, cycleId: cycle.id },
      null,
      2,
    ),
  );
  console.log(
    "PASS: downloaded filled roster/blank marks template, uploaded invalid/valid UTF-8 CSVs, reviewed errors, atomically saved 99 entries, downloaded Urdu matrix CSV/PDF, preserved blank marks, explicitly acknowledged an overwrite, and verified layouts at 1440/1024/820/768/390/320px.",
  );
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({
      path: ".data/screenshots/session-results-error.png",
      fullPage: true,
    });
    console.log(
      "Session sheet browser headings:",
      await page.locator("h1,h2,[role=alert]").allTextContents(),
    );
  }
  throw error;
} finally {
  await browser.close();
}
