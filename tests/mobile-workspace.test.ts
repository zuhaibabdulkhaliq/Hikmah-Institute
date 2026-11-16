import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  workspaceAccess,
  workspaceViews,
  validSchoolDate,
  normalizeNumericInput,
  type Identity,
} from "../packages/api-client/src/index.ts";
import { translate } from "../packages/ui-tokens/src/i18n.ts";
const identity = (changes: Partial<Identity>): Identity => ({
  userId: "test",
  name: "Synthetic staff",
  today: "2026-11-16",
  timezone: "Asia/Karachi",
  roles: [],
  accessVersion: "test",
  managedSections: [],
  attendanceSections: [],
  teachingSections: [],
  sectionAssignments: [],
  ...changes,
});
const visible = (me: Identity) =>
  workspaceViews.filter((v) => workspaceAccess(me, v));
test("Web and native share all eleven workspace routes, with exact administrator, Mushrif, subject teacher and Ameer access", () => {
  assert.equal(workspaceViews.length, 11);
  assert.equal(new Set(workspaceViews).size, 11);
  assert.deepEqual(visible(identity({ roles: ["ADMIN"] })), workspaceViews);
  assert.deepEqual(visible(identity({ attendanceSections: ["A"] })), [
    "Overview",
    "Attendance",
  ]);
  assert.deepEqual(visible(identity({ teachingSections: ["A"] })), [
    "Overview",
    "Marks entry",
  ]);
  assert.deepEqual(
    visible(identity({ managedSections: ["A"], attendanceSections: ["A"] })),
    [
      "Overview",
      "Academic calendar",
      "Attendance",
      "Exams & schemes",
      "Marks entry",
      "Results & reports",
    ],
  );
  assert.deepEqual(visible(identity({})), ["Overview"]);
  assert(!workspaceAccess(identity({ roles: ["ADMIN"] }), "unknown route"));
  assert(
    !workspaceAccess(
      identity({ managedSections: ["A"] }),
      "Correction requests",
    ),
  );
});
test("Incomplete and impossible calendar inputs cannot become rendering dates; ISO leap-day dates remain exact", () => {
  for (const input of [
    "",
    "2026-",
    "2026-99-99",
    "2026-02-29",
    "2026-02-31",
    "2026-04-31",
    "2026-11-16T00:00:00Z",
    "not-a-date",
  ])
    assert.equal(validSchoolDate(input), false, input);
  for (const input of ["2024-02-29", "2026-01-01", "2026-11-16", "2026-12-31"])
    assert.equal(validSchoolDate(input), true, input);
});
test("Native menu, confirmation, file import and unsaved-edit prompts have Urdu translations without changing identifiers", () => {
  for (const label of [
    ...workspaceViews,
    "More",
    "Unsaved changes",
    "Keep editing",
    "Discard changes and continue",
    "Find a feature",
    "Choose CSV file",
    "Validate CSV",
    "I reviewed and approve these changes",
    "Approve institute policy",
    "Private invitation or recovery link",
    "Flexible academic calendar",
  ])
    assert.notEqual(translate("ur", label), label, label);
  assert.equal(translate("ur", "Awarded SYN-001"), "حاصل کردہ نمبر SYN-001");
  assert.equal(translate("ur", "SYN-001"), "SYN-001");
});

test("Urdu and Arabic numeric keyboard digits normalize without changing unrelated text or identifier formatting", () => {
  assert.equal(normalizeNumericInput("۱۲٫۵۰"), "12.50");
  assert.equal(normalizeNumericInput("٠١٫٥"), "01.5");
  assert.equal(normalizeNumericInput("۲۰۲۶-۱۱-۱۶"), "2026-11-16");
  assert.equal(normalizeNumericInput("01"), "01");
  assert.equal(normalizeNumericInput("not a number"), "not a number");
});

test("Paged catalogues fail clearly on an older server that repeats the first page, rather than looping or silently losing records", async () => {
  const { readCatalog, ApiError } =
    await import("../packages/api-client/src/index.ts");
  let calls = 0;
  const request = async <T>() => {
    calls++;
    return Array.from({ length: 500 }, (_, i) => ({ id: String(i) })) as T;
  };
  await assert.rejects(
    readCatalog(request, "/v1/students"),
    (e: any) => e instanceof ApiError && e.status === 409,
  );
  assert.equal(calls, 2);
});
test("Native browser preview CORS permits the same PUT/PATCH operations as the authenticated API contract", async () => {
  const { buildApp } = await import("../apps/api/src/server.ts");
  const app = await buildApp();
  try {
    for (const method of ["PUT", "PATCH"]) {
      const r = await app.inject({
        method: "OPTIONS",
        url: "/v1/sections/test/attendance/test",
        headers: {
          origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
          "access-control-request-method": method,
          "access-control-request-headers":
            "authorization,content-type,if-match",
        },
      });
      assert.equal(r.statusCode, 204);
      assert(
        String(r.headers["access-control-allow-methods"]).includes(method),
      );
      assert(
        String(r.headers["access-control-allow-headers"]).includes("if-match"),
      );
    }
  } finally {
    await app.close();
  }
});
test("Native and web catalogues retrieve more than 500 students while preserving administrator-only access", async () => {
  const { buildApp } = await import("../apps/api/src/server.ts"),
    { pool } = await import("../apps/api/src/db.ts"),
    { randomUUID } = await import("node:crypto"),
    { readCatalog } = await import("../packages/api-client/src/index.ts");
  const app = await buildApp(),
    prefix = "MOBILE-PAGE-" + randomUUID();
  try {
    const org = (await pool.query("SELECT id FROM organizations LIMIT 1"))
      .rows[0].id;
    await pool.query(
      "INSERT INTO students(organization_id,student_number,full_name) SELECT $1,$2||n::text,'Synthetic catalogue learner '||n::text FROM generate_series(1,610) n",
      [org, prefix],
    );
    const login = async (role: string) => {
      const r = await app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        remoteAddress: role === "admin" ? "127.44.0.1" : "127.44.0.2",
        payload: {
          email: role + "@hikmah.example",
          password: process.env.DEMO_PASSWORD,
        },
      });
      assert.equal(r.statusCode, 200);
      return { authorization: "Bearer " + r.json().token };
    };
    const admin = await login("admin"),
      ameer = await login("ameer");
    const request = async <T>(path: string) => {
      const r = await app.inject({ url: path, headers: admin });
      assert.equal(r.statusCode, 200, r.body);
      return r.json() as T;
    };
    const rows = await readCatalog<{ id: string; student_number: string }>(
      request,
      "/v1/students",
    );
    assert.equal(
      rows.filter((s) => s.student_number.startsWith(prefix)).length,
      610,
    );
    assert.equal(rows.length, new Set(rows.map((r) => r.id)).size);
    assert.equal(
      (
        await app.inject({
          url: "/v1/students?limit=500&offset=500",
          headers: ameer,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ url: "/v1/students?limit=501", headers: admin }))
        .statusCode,
      400,
    );
    assert.equal(
      (await app.inject({ url: "/v1/students?offset=-1", headers: admin }))
        .statusCode,
      400,
    );
  } finally {
    await pool.query("DELETE FROM students WHERE student_number LIKE $1", [
      prefix + "%",
    ]);
    await app.close();
  }
});

after(async () => {
  const { pool } = await import("../apps/api/src/db.ts");
  await pool.end();
});

test("Validation feedback identifies rejected fields without displaying submitted secrets", async () => {
  const { createClient, ApiError } =
    await import("../packages/api-client/src/index.ts");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          message: "Invalid request",
          issues: [
            {
              path: ["password"],
              message: "Use at least 12 characters",
              input: "DO-NOT-REVEAL-THIS",
            },
          ],
        }),
        { status: 400 },
      );
    await assert.rejects(createClient("")("/v1/users"), (e: any) => {
      assert(e instanceof ApiError);
      assert(e.message.includes("password: Use at least 12 characters"));
      assert(!e.message.includes("DO-NOT-REVEAL-THIS"));
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});
