import { chromium, expect } from "@playwright/test";
const base = process.env.MOBILE_PREVIEW_URL ?? "http://localhost:8081";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.route("**/v1/me", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 17000));
    await route.continue().catch(() => {});
  });
  await page.goto(base);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("admin@hikmah.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText(
      "The server is taking too long. Check its address and try again.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 22000 });
  await page.unroute("**/v1/me");
  await page
    .getByRole("button", { name: "Retry saved session", exact: true })
    .click();
  await expect(page.getByText("Quick actions", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Open workspace menu", exact: true })
    .click();
  let menu = page.getByRole("dialog").last();
  await menu
    .getByLabel("Find a feature", { exact: true })
    .fill("Academic setup");
  await menu
    .getByRole("button", { name: "Academic setup", exact: true })
    .click();
  await expect(menu).not.toBeVisible();
  await page
    .getByRole("button", { name: "Institute details", exact: true })
    .click();
  const institute = page.getByTestId("section-Institute details");
  await expect(
    institute.getByLabel("English name", { exact: true }),
  ).toBeVisible();
  const name = institute.getByLabel("English name", { exact: true });
  const original = await name.inputValue();
  await name.fill("Unsaved local-only test");
  await page
    .getByRole("button", { name: "Open workspace menu", exact: true })
    .click();
  menu = page.getByRole("dialog").last();
  await menu.getByLabel("Find a feature", { exact: true }).fill("Overview");
  await menu.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page
    .getByRole("button", { name: "Open workspace menu", exact: true })
    .click();
  menu = page.getByRole("dialog").last();
  await menu.getByLabel("Find a feature", { exact: true }).fill("Overview");
  await menu.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes and continue", exact: true })
    .click();
  await expect(page.getByText("Quick actions", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Open workspace menu", exact: true })
    .click();
  menu = page.getByRole("dialog").last();
  await menu
    .getByLabel("Find a feature", { exact: true })
    .fill("Academic setup");
  await menu
    .getByRole("button", { name: "Academic setup", exact: true })
    .click();
  await expect(menu).not.toBeVisible();
  await page
    .getByRole("button", { name: "Institute details", exact: true })
    .click();
  await expect(name).toHaveValue(original);
  expect(errors).toEqual([]);
  console.log(
    "PASS: delayed metadata times out visibly, saved session retries without a password, unsaved navigation can be cancelled or discarded, and discarded fields do not persist.",
  );
} finally {
  await browser.close();
}
