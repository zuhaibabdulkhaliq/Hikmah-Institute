import { chromium, expect, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { sheetCSV } from "../packages/domain/src/index.ts";
if (process.env.SMOKE_DISPOSABLE !== "1")
  throw Error(
    "Use only a disposable synthetic installation with SMOKE_DISPOSABLE=1.",
  );
const base = process.env.MOBILE_PREVIEW_URL ?? "http://localhost:8081",
  apiBase = process.env.MOBILE_API_URL ?? "http://localhost:3304";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let token = "";
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().endsWith("/api/auth/sign-in/email") && r.status() === 200)
    void r.json().then((d) => {
      token = d.token;
    });
});
await mkdir(".data/screenshots/mobile-redesign", { recursive: true });
async function request(path: string, method = "GET", data?: unknown) {
  const r = await page.request.fetch(apiBase + path, {
    method,
    data,
    headers: { authorization: `Bearer ${token}`, origin: base },
  });
  if (!r.ok())
    throw Error(`${method} ${path}: ${r.status()} ${await r.text()}`);
  return r.json();
}
async function dismiss() {
  const close = page.getByRole("button", {
    name: "Dismiss message",
    exact: true,
  });
  if (await close.count()) await close.click();
}
async function navigate(view: string) {
  await dismiss();
  await page
    .getByRole("button", { name: "Open workspace menu", exact: true })
    .click();
  const menu = page.getByRole("dialog").last();
  await menu.getByLabel("Find a feature", { exact: true }).fill(view);
  await menu.getByRole("button", { name: view, exact: true }).click();
  const discard = page.getByRole("button", {
    name: "Discard changes and continue",
    exact: true,
  });
  if (await discard.count()) await discard.click();
  await expect(
    page.getByRole("heading", { name: view, exact: true }).first(),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
}
async function choose(
  label: string,
  option: string | RegExp,
  within: Locator = page.locator("body"),
) {
  await within.getByRole("button", { name: label, exact: true }).click();
  const menu = page.getByRole("dialog").last();
  await menu
    .getByLabel("Search", { exact: true })
    .fill(typeof option === "string" ? option : option.source.split(".*")[0]);
  await menu
    .getByRole("radio", { name: option, exact: typeof option === "string" })
    .first()
    .click();
}
async function success(text: string) {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await dismiss();
}
try {
  await page.goto(base);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("admin@hikmah.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Quick actions", { exact: true })).toBeVisible();
  await expect.poll(() => !!token).toBeTruthy();
  const me = await request("/v1/me"),
    seed = (await request("/v1/sections")).find(
      (s: any) => s.code === "A" && s.year_label === "1448 synthetic",
    ),
    seedCycle = (await request("/v1/exam-cycles")).find(
      (c: any) =>
        c.academic_year_id === seed.academic_year_id && c.code === "SHASH_MAHI",
    );
  const source = (
      await request(
        `/v1/exam-cycles/${seedCycle.id}/sections/${seed.id}/scheme`,
      )
    ).scheme,
    sourceOfferings = await request(`/v1/sections/${seed.id}/subjects`);
  const suffix = randomUUID().slice(0, 8),
    yearName = "Native review " + suffix,
    className = "Mobile class " + suffix,
    studentNumber = "MOBILE-" + suffix;
  const date = (n: number) =>
    new Date(Date.parse(me.today) + n * 86400000).toISOString().slice(0, 10);
  await navigate("Academic setup");
  const records = page.getByTestId("card-Academic records");
  await records.getByLabel("Academic year", { exact: true }).fill(yearName);
  await records.getByLabel("Start date", { exact: true }).fill(date(-7));
  await records.getByLabel("End date", { exact: true }).fill(date(30));
  await choose("Status", "Active", records);
  await records
    .getByRole("button", { name: "Create record", exact: true })
    .click();
  await success("Record saved.");
  const year = (await request("/v1/academic-years")).find(
    (y: any) => y.label === yearName,
  );
  await choose("Manage", "Class sections", records);
  await choose("Academic year", yearName, records);
  const program = (await request("/v1/programs")).find(
      (p: any) => p.id === seed.program_id,
    ),
    level = (await request("/v1/levels")).find(
      (l: any) => l.id === seed.level_id,
    );
  await choose("Program", program.name, records);
  await choose("Class level", level.name_ur ?? level.name_en, records);
  await records.getByLabel("Section code", { exact: true }).fill("MOB");
  await records.getByLabel("Class name", { exact: true }).fill(className);
  await records
    .getByRole("button", { name: "Create record", exact: true })
    .click();
  await success("Record saved.");
  const section = (await request("/v1/sections")).find(
    (s: any) => s.name === className,
  );
  expect(section.academic_year_id).toBe(year.id);
  await choose("Manage", "Students", records);
  await records
    .getByLabel("Student number", { exact: true })
    .fill(studentNumber);
  await records
    .getByLabel("Full name", { exact: true })
    .fill("Synthetic mobile learner");
  await records
    .getByLabel("Urdu name", { exact: true })
    .fill("مصنوعی طالب علم");
  await records
    .getByRole("button", { name: "Create record", exact: true })
    .click();
  await success("Record saved.");
  await choose("Section", new RegExp(className));
  await page
    .getByRole("button", { name: "Enroll learners", exact: true })
    .click();
  const enroll = page.getByTestId("section-Enroll learners");
  await choose("Student", new RegExp(studentNumber), enroll);
  await enroll.getByLabel("Roll number", { exact: true }).fill("01");
  await enroll.getByLabel("Joined on", { exact: true }).fill(me.today);
  await enroll
    .getByRole("button", { name: "Enroll learner", exact: true })
    .click();
  await success("Learner enrolled.");
  console.log(
    "PASS: native academic year, class, student and enrollment forms write real scoped records.",
  );
  // Prepare the established eleven-paper example in this disposable class.
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
  const cycle = (await request("/v1/exam-cycles")).find(
      (c: any) => c.academic_year_id === year.id && c.code === "SHASH_MAHI",
    ),
    path = `/v1/exam-cycles/${cycle.id}/sections/${section.id}`;
  await request(path + "/scheme", "PUT", { papers, groups: source.groups });
  await navigate("Academic calendar");
  await page
    .getByRole("button", { name: "Schedule change", exact: true })
    .count();
  const calendar = page.getByTestId("card-Schedule change");
  await calendar.getByLabel("Effective from", { exact: true }).fill(me.today);
  await calendar.getByLabel("Through", { exact: true }).fill(me.today);
  await calendar
    .getByRole("button", { name: "All seven days", exact: true })
    .click();
  await calendar
    .getByLabel("Reason for change", { exact: true })
    .fill("Synthetic native teaching-day check");
  await calendar
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const preview = page.getByTestId("card-Calendar change preview");
  await expect(preview).toBeVisible();
  await preview
    .getByRole("switch", {
      name: "I reviewed and approve these changes",
      exact: true,
    })
    .check();
  await preview
    .getByRole("button", { name: "Apply calendar changes", exact: true })
    .click();
  await success("Academic calendar updated.");
  await navigate("Attendance");
  await page
    .getByRole("button", { name: "Mark all present", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await success("Attendance draft saved.");
  await page
    .getByRole("button", { name: "Submit complete roster", exact: true })
    .click();
  await success("Attendance submitted.");
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  console.log(
    "PASS: native calendar preview/apply and academic-day attendance draft, submission and lock.",
  );
  await navigate("Exams & schemes");
  await page
    .getByRole("button", { name: "Class curriculum", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Create curriculum from this session",
      exact: true,
    })
    .click();
  await success("Class curriculum created.");
  await page
    .getByRole("button", {
      name: "Exam dates and attendance window",
      exact: true,
    })
    .click();
  const window = page.getByTestId("section-Exam dates and attendance window");
  await window.getByLabel("Attendance from", { exact: true }).fill(me.today);
  await window.getByLabel("Attendance through", { exact: true }).fill(me.today);
  await window
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await success("Exam window saved.");
  const scheme = page.getByTestId("card-Paper scheme & result groups");
  await scheme
    .getByRole("switch", {
      name: "I reviewed and approve these changes",
      exact: true,
    })
    .check();
  await scheme
    .getByRole("button", { name: "Approve scheme", exact: true })
    .click();
  await success("Scheme approved.");
  await navigate("Marks entry");
  const all = await request("/v1/assessments"),
    paper = all.find(
      (p: any) => p.section_id === section.id && p.paper_code === "P01",
    );
  await choose("Paper", new RegExp(className + ".*P01"));
  await page.getByLabel("Awarded " + studentNumber, { exact: true }).fill("0");
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  await success("Marks saved.");
  const saved = await request(`/v1/assessments/${paper.id}/marks`);
  expect(saved.entries[0].awarded).toBe("0.00");
  await page.getByLabel("Awarded " + studentNumber, { exact: true }).fill("30");
  await page
    .getByRole("switch", {
      name: "Given on time " + studentNumber,
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  await success("Marks saved.");
  await page.getByRole("button", { name: "Submit paper", exact: true }).click();
  await success("Paper submitted for review.");
  await expect(
    page.getByLabel("Awarded " + studentNumber, { exact: true }),
  ).not.toBeEditable();
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("Native reviewed paper correction");
  await page.getByRole("button", { name: "Reopen paper", exact: true }).click();
  await success("Paper reopened with an audit record.");
  console.log(
    "PASS: native curriculum, attendance window, scheme approval, graded zero, timing, submission lock and reviewed reopen.",
  );
  await navigate("Results & reports");
  await page
    .getByRole("button", { name: "Upload class marks", exact: true })
    .click();
  const upload = page.getByTestId("card-Import marks from CSV");
  await upload
    .getByRole("switch", {
      name: "Include exam leave and on-time columns",
      exact: true,
    })
    .check();
  const download = await Promise.all([
    page.waitForEvent("download"),
    upload
      .getByRole("button", { name: "Download blank marks CSV", exact: true })
      .click(),
  ]).then(([d]) => d);
  const filePath = await download.path();
  const { readFile } = await import("node:fs/promises");
  const rows = parse(await readFile(filePath!, "utf8"), {
    bom: true,
    relax_column_count: true,
  }) as string[][];
  const sample = [30, 31, 27, 28, 55, 88, 61, 30, 24, 58, 81],
    flag = rows[6].length - papers.length * 2;
  for (let j = 0; j < papers.length; j++) {
    rows[7][j + 4] = String(sample[j]);
    rows[7][flag + j * 2] = "NO";
    rows[7][flag + j * 2 + 1] = "YES";
  }
  const chooser = await Promise.all([
    page.waitForEvent("filechooser"),
    upload
      .getByRole("button", { name: "Choose CSV file", exact: true })
      .click(),
  ]).then(([c]) => c);
  await chooser.setFiles({
    name: "native-marks.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheetCSV(rows)),
  });
  await expect(upload.getByLabel("CSV data", { exact: true })).not.toHaveValue(
    "",
  );
  await upload
    .getByLabel("Change or import reason", { exact: true })
    .fill("Synthetic native class import review");
  await upload
    .getByRole("button", { name: "Validate CSV", exact: true })
    .click();
  await expect(
    upload.getByText(
      "Validation passed. Review the proposed changes before applying.",
      { exact: true },
    ),
  ).toBeVisible();
  await upload
    .getByRole("switch", {
      name: "I reviewed and approve these changes",
      exact: true,
    })
    .check();
  await upload
    .getByRole("button", { name: "Apply previewed import", exact: true })
    .click();
  await success("Import applied successfully.");
  const updated = (await request("/v1/assessments")).filter(
    (p: any) => p.section_id === section.id,
  );
  for (const p of updated) {
    await request(`/v1/assessments/${p.id}/submit`, "POST", {});
    await request(`/v1/assessments/${p.id}/approve`, "POST", {});
  }
  await navigate("Policies");
  const policy = page.getByTestId("card-Academic policy approval");
  await policy
    .getByRole("switch", {
      name: "I reviewed and approve the institute policy",
      exact: true,
    })
    .check();
  await policy
    .getByRole("button", { name: "Approve institute policy", exact: true })
    .click();
  await success("Policy explicitly approved.");
  await navigate("Results & reports");
  const publish = page.getByTestId("card-Preflight & publication");
  await publish
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await expect(
    publish.getByText("All publication checks passed.", { exact: true }),
  ).toBeVisible();
  await expect(publish.getByText(/513 \/ 600/)).toBeVisible();
  await publish
    .getByRole("switch", {
      name: "I reviewed and approve official publication",
      exact: true,
    })
    .check();
  await publish
    .getByRole("button", { name: "Publish result revision", exact: true })
    .click();
  await success("Immutable result revision and PDFs published.");
  const archive = page.getByTestId("card-Publication archive");
  await archive.getByRole("button", { name: /Revision 1/ }).click();
  const pdfDownload = await Promise.all([
    page.waitForEvent("download"),
    archive
      .getByRole("button", { name: "Share class PDF", exact: true })
      .click(),
  ]).then(([d]) => d);
  const pdf = await readFile((await pdfDownload.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await writeFile(
    ".data/screenshots/mobile-redesign/native-result-proof.pdf",
    pdf,
  );
  await page.screenshot({
    path: ".data/screenshots/mobile-redesign/published-result.png",
    fullPage: true,
  });
  console.log(
    "PASS: native document picker, filled CSV validation, overwrite review, atomic import, explicit test policy approval, 513/600 publication and real PDF download.",
  );
  expect(errors).toEqual([]);
} catch (error) {
  await page.screenshot({
    path: ".data/screenshots/mobile-redesign/workflow-error.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
