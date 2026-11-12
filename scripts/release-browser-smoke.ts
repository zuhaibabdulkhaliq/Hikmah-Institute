import { chromium, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { translate } from "../packages/ui-tokens/src/i18n.ts";
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
});
await mkdir(".data/screenshots", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  await page.goto(base);
  await page.getByRole("button", { name: "اردو", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ur");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("button", { name: translate("ur", "Sign in"), exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ur");
  await page
    .getByLabel(translate("ur", "Email address"), { exact: true })
    .fill("admin2@hikmah.example");
  await page
    .getByLabel(translate("ur", "Password"), { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page
    .getByRole("button", { name: translate("ur", "Sign in"), exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: translate("ur", "A clear view of your institute"),
      exact: true,
    }),
  ).toBeVisible();
  const views = [
    "Overview",
    "Academic setup",
    "Academic calendar",
    "Attendance",
    "Exams & schemes",
    "Marks entry",
    "Policies",
    "Results & reports",
    "People & access",
    "Correction requests",
    "Audit history",
  ];
  for (const width of [1440, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const view of views) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: translate("ur", view), exact: true })
        .click();
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: translate(
            "ur",
            view === "Overview" ? "A clear view of your institute" : view,
          ),
          exact: true,
        }),
      ).toBeVisible();
      const size = await page.evaluate(() => ({
        width: innerWidth,
        actual: document.documentElement.scrollWidth,
      }));
      expect(
        size.actual,
        `Urdu overflow ${view} at ${width}`,
      ).toBeLessThanOrEqual(size.width + 1);
      if (view === "Attendance") {
        const statusValues = await page
          .locator("select")
          .evaluateAll((selects) =>
            selects.flatMap((s) =>
              Array.from((s as HTMLSelectElement).options).map((o) => o.value),
            ),
          );
        expect(statusValues).not.toContain(translate("ur", "PRESENT"));
      }
      if (view === "Overview" && [1440, 820, 390].includes(width))
        await page.screenshot({
          path: `.data/screenshots/urdu-overview-${width}.png`,
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page
    .getByRole("button", { name: translate("ur", "My account"), exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: translate("ur", "Account settings"),
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByLabel(translate("ur", "Current password"), { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: translate("ur", "Close"), exact: true })
    .click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  const adminRequest = page.request;
  const target = await adminRequest.post(base + "/v1/users", {
    headers: { origin: base },
    data: {
      email: `browser-${randomUUID()}@hikmah.example`,
      name: "Synthetic password browser user",
      password: "Browser-Initial-2026!",
    },
  });
  expect(target.status()).toBe(201);
  const account = await target.json();
  const sectionList = await (
    await adminRequest.get(base + "/v1/sections")
  ).json();
  const section = sectionList.find(
    (s: any) => s.code === "A" && s.year_label === "1448 synthetic",
  );
  expect(
    (
      await adminRequest.post(base + `/v1/sections/${section.id}/staff`, {
        headers: { origin: base },
        data: {
          user_id: account.id,
          role: "AMEER",
          starts_on: "2026-01-01",
          ameerOverrideReason: "Synthetic account password browser test",
        },
      })
    ).status(),
  ).toBe(200);
  const staffContext = await browser.newContext();
  const otherDevice = await browser.newContext();
  const staff = await staffContext.newPage();
  staff.on("pageerror", (e) => errors.push(e.message));
  await staff.goto(base);
  await staff.getByLabel("Email address", { exact: true }).fill(account.email);
  await staff
    .getByLabel("Password", { exact: true })
    .fill("Browser-Initial-2026!");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await staff
    .getByRole("heading", { name: "A clear view of your institute" })
    .waitFor();
  expect(
    (
      await otherDevice.request.post(base + "/api/auth/sign-in/email", {
        headers: { origin: base },
        data: { email: account.email, password: "Browser-Initial-2026!" },
      })
    ).status(),
  ).toBe(200);
  await staff.getByRole("button", { name: "My account", exact: true }).click();
  const settings = staff.getByRole("dialog", { name: "Account settings" });
  await settings
    .getByLabel("Current password", { exact: true })
    .fill("Incorrect-current-2026!");
  await settings
    .getByLabel("New password", { exact: true })
    .fill("Browser-Updated-2026!");
  await settings
    .getByLabel("Confirm new password", { exact: true })
    .fill("Browser-Updated-2026!");
  await settings
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(settings.getByRole("alert")).toHaveText(
    "Current password is incorrect",
  );
  await settings
    .getByLabel("Current password", { exact: true })
    .fill("Browser-Initial-2026!");
  await settings
    .getByLabel("Confirm new password", { exact: true })
    .fill("Mismatched-Password-2026!");
  await settings
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(settings.getByRole("alert")).toHaveText(
    "Passwords do not match.",
  );
  await settings
    .getByLabel("Confirm new password", { exact: true })
    .fill("Browser-Updated-2026!");
  await settings
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(staff.getByRole("status")).toHaveText(
    "Password changed. Sign in again with your new password.",
  );
  expect((await otherDevice.request.get(base + "/v1/me")).status()).toBe(401);
  await staff.getByLabel("Email address", { exact: true }).fill(account.email);
  await staff
    .getByLabel("Password", { exact: true })
    .fill("Browser-Updated-2026!");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await staff
    .getByRole("heading", { name: "A clear view of your institute" })
    .waitFor();
  expect(
    (
      await adminRequest.put(base + `/v1/users/${account.id}/password`, {
        headers: { origin: base },
        data: {
          password: "Browser-AdminReset-2026!",
          reason: "Synthetic browser administrator reset",
        },
      })
    ).status(),
  ).toBe(200);
  expect((await staff.request.get(base + "/v1/me")).status()).toBe(401);
  expect(
    (
      await adminRequest.patch(base + `/v1/users/${account.id}`, {
        headers: { origin: base },
        data: { active: false, admin: false },
      })
    ).status(),
  ).toBe(200);
  await staffContext.close();
  await otherDevice.close();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "PASS: persisted Urdu/English switch, RTL, all 11 Urdu pages at six widths, original attendance enum values, account settings, wrong/mismatched password checks, successful password change, second-device revocation, admin reset, English return and sign-out.",
  );
} catch (e) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page)
    await page.screenshot({
      path: ".data/screenshots/release-error.png",
      fullPage: true,
    });
  throw e;
} finally {
  await browser.close();
}
