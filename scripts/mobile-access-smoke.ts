import { chromium, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
const errors: string[] = [];
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let adminToken = "";
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().endsWith("/api/auth/sign-in/email") && r.status() === 200)
    void r.json().then((d) => {
      adminToken = d.token;
    });
});
async function login(p: Page, email: string, password: string) {
  await p.goto(base);
  await p.getByLabel("Email address", { exact: true }).fill(email);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p.getByText("Quick actions", { exact: true })).toBeVisible();
}
async function dismiss(p: Page) {
  const button = p.getByRole("button", {
    name: "Dismiss message",
    exact: true,
  });
  if (await button.count()) await button.click();
}
async function nav(p: Page, view: string) {
  await dismiss(p);
  await p
    .getByRole("button", { name: "Open workspace menu", exact: true })
    .click();
  const menu = p.getByRole("dialog").last();
  await menu.getByLabel("Find a feature", { exact: true }).fill(view);
  await menu.getByRole("button", { name: view, exact: true }).click();
  await expect(
    p.getByRole("heading", { name: view, exact: true }).first(),
  ).toBeVisible();
  await p.waitForLoadState("networkidle");
}
async function request(path: string, method = "GET", data?: unknown) {
  const r = await page.request.fetch(apiBase + path, {
    method,
    data,
    headers: { authorization: `Bearer ${adminToken}`, origin: base },
  });
  if (!r.ok())
    throw Error(`${method} ${path}: ${r.status()} ${await r.text()}`);
  return r.json();
}
try {
  await login(page, "admin@hikmah.example", process.env.DEMO_PASSWORD!);
  await expect.poll(() => !!adminToken).toBeTruthy();
  await nav(page, "People & access");
  const suffix = randomUUID().slice(0, 8),
    email = `mobile-access-${suffix}@hikmah.example`,
    password = "Native-Initial-2026!";
  await page
    .getByRole("button", { name: "Create staff account", exact: true })
    .click();
  const create = page.getByTestId("section-Create staff account");
  await create
    .getByLabel("Staff name", { exact: true })
    .fill("Synthetic mobile access " + suffix);
  await create.getByLabel("Email address", { exact: true }).fill(email);
  await create.getByLabel("Initial password", { exact: true }).fill(password);
  await create.getByLabel("Confirm password", { exact: true }).fill(password);
  await create
    .getByRole("button", { name: "Create staff account", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Staff account created.", { exact: true }),
  ).toBeVisible();
  await dismiss(page);
  await expect(
    create.getByLabel("Initial password", { exact: true }),
  ).toHaveValue("");
  const account = (await request("/v1/users")).find(
      (u: any) => u.email === email,
    ),
    me = await request("/v1/me"),
    section = (await request("/v1/sections")).find(
      (s: any) => s.code === "A" && s.year_label === "1448 synthetic",
    );
  await request(`/v1/sections/${section.id}/staff`, "POST", {
    user_id: account.id,
    role: "AMEER",
    starts_on: me.today,
    ameerOverrideReason: "Synthetic native access verification",
  });
  const staffContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    staff = await staffContext.newPage();
  staff.on("pageerror", (e) => errors.push(e.message));
  await login(staff, email, password);
  await staff.getByRole("button", { name: "More", exact: true }).click();
  const menu = staff.getByRole("dialog").last();
  await expect(
    menu.getByRole("button", { name: "Attendance", exact: true }),
  ).toBeVisible();
  for (const denied of [
    "Marks entry",
    "Academic setup",
    "Policies",
    "Results & reports",
    "People & access",
    "Audit history",
  ])
    await expect(
      menu.getByRole("button", { name: denied, exact: true }),
    ).toHaveCount(0);
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await nav(staff, "My account");
  await staff
    .getByRole("button", { name: "Change my password", exact: true })
    .click();
  await staff.getByLabel("Current password", { exact: true }).fill(password);
  await staff
    .getByLabel("New password", { exact: true })
    .fill("Native-Updated-2026!");
  await staff
    .getByLabel("Confirm new password", { exact: true })
    .fill("Different-password!");
  await staff
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    staff.getByText("Passwords do not match.", { exact: true }),
  ).toBeVisible();
  await staff
    .getByLabel("Confirm new password", { exact: true })
    .fill("Native-Updated-2026!");
  await staff
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    staff.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await login(staff, email, "Native-Updated-2026!");
  await nav(page, "People & access");
  await page
    .getByRole("button", {
      name: "Change a staff password directly",
      exact: true,
    })
    .click();
  const change = page.getByTestId("section-Change a staff password directly");
  await change
    .getByRole("button", { name: "Staff account", exact: true })
    .click();
  const choice = page.getByRole("dialog").last();
  await choice.getByLabel("Search", { exact: true }).fill(email);
  await choice.getByRole("radio", { name: new RegExp(email) }).click();
  await change
    .getByLabel("New password", { exact: true })
    .fill("Native-Reset-2026!");
  await change
    .getByLabel("Confirm new password", { exact: true })
    .fill("Native-Reset-2026!");
  await change
    .getByLabel("Correction reason", { exact: true })
    .fill("Synthetic native administrator reset");
  await change
    .getByRole("button", { name: "Change staff password", exact: true })
    .click();
  await expect(
    page.getByText("Staff password changed; sessions revoked.", {
      exact: true,
    }),
  ).toBeVisible();
  await dismiss(page);
  // Any subsequent native read must observe server revocation and clear stale workspace.
  await staff
    .getByRole("button", { name: "Open workspace menu", exact: true })
    .click();
  await staff
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "My activity", exact: true })
    .click();
  await expect(
    staff.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await login(staff, email, "Native-Reset-2026!");
  for (const [role, allowed, denied] of [
    ["teacher", "Marks entry", "Attendance"],
    ["mushrif", "Exams & schemes", "People & access"],
  ] as const) {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await login(p, role + "@hikmah.example", process.env.DEMO_PASSWORD!);
    await p.getByRole("button", { name: "More", exact: true }).click();
    const roleMenu = p.getByRole("dialog").last();
    await expect(
      roleMenu.getByRole("button", { name: allowed, exact: true }),
    ).toBeVisible();
    await expect(
      roleMenu.getByRole("button", { name: denied, exact: true }),
    ).toHaveCount(0);
    await context.close();
  }
  // An invitation can be accepted inside the native sign-in flow.
  const invitation = await request("/v1/invitations", "POST", {
    name: "Synthetic native invited staff",
    email: `mobile-invite-${suffix}@hikmah.example`,
  });
  const invited = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    activation = await invited.newPage();
  await activation.goto(base);
  await activation
    .getByRole("button", {
      name: "Activate account / recover password",
      exact: true,
    })
    .click();
  await activation
    .getByLabel("Private invitation or recovery link", { exact: true })
    .fill(invitation.activationUrl);
  await activation
    .getByLabel("New password", { exact: true })
    .fill("Native-Invitation-2026!");
  await activation
    .getByLabel("Confirm new password", { exact: true })
    .fill("Native-Invitation-2026!");
  await activation
    .getByRole("button", { name: "Set password", exact: true })
    .click();
  await expect(
    activation.getByText("Password saved. You can now sign in.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "PASS: native account creation, private field clearing, Ameer/teacher/Mushrif menus, password confirmation, owner change, admin reset, revoked session handling and invitation activation.",
  );
} catch (error) {
  await page.screenshot({
    path: ".data/screenshots/mobile-redesign/access-error.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
