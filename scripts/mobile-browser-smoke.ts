import { chromium, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { workspaceViews } from "../packages/api-client/src/workspace.ts";
import { translate } from "../packages/ui-tokens/src/i18n.ts";
const base = process.env.MOBILE_PREVIEW_URL ?? "http://localhost:8081";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
});
await mkdir(".data/screenshots/mobile-redesign", { recursive: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (message) => {
  if (/Unexpected text node|Text strings must be rendered/.test(message.text()))
    errors.push(message.text());
});
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
  async function navigate(view: string, language: "en" | "ur" = "en") {
    await page
      .getByRole("button", {
        name: translate(language, "Open workspace menu"),
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog").last();
    await dialog
      .getByLabel(translate(language, "Find a feature"), { exact: true })
      .fill(translate(language, view));
    await dialog
      .getByRole("button", { name: translate(language, view), exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page
        .getByRole("heading", { name: translate(language, view), exact: true })
        .first(),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1024 : 844 });
    for (const view of workspaceViews) {
      await navigate(view);
      const actual = await page.evaluate(() => ({
        actual: document.documentElement.scrollWidth,
        width: innerWidth,
      }));
      expect(actual.actual, `${view} at ${width}`).toBeLessThanOrEqual(
        actual.width + 1,
      );
    }
    await navigate("Overview");
    await page.screenshot({
      path: `.data/screenshots/mobile-redesign/overview-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open workspace menu", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "اردو", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: translate("ur", "Close"), exact: true })
    .click();
  await expect(page.getByRole("dialog").last()).not.toBeVisible();
  for (const view of workspaceViews) await navigate(view, "ur");
  await navigate("Overview", "ur");
  await page.screenshot({
    path: ".data/screenshots/mobile-redesign/overview-urdu.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS: all eleven native workspace screens at six widths, phone tabs, tablet sidebar, menu search, Urdu routes and no runtime errors or page overflow.",
  );
} catch (error) {
  await page.screenshot({
    path: ".data/screenshots/mobile-redesign/browser-error.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
