import type { FastifyInstance, RouteOptions } from "fastify";
import { z } from "zod";
import { actor } from "./security.ts";
import { resources } from "./academics.ts";
import {
  attendanceRecord,
  attendanceDay,
  markInput,
  schemeSchema,
  policySchema,
  uuid,
  schoolDate,
} from "../../../packages/domain/src/index.ts";
const text = z.string().min(1),
  reason = z.object({ reason: z.string().min(5).max(1000) });
const bodySchemas: Record<string, z.ZodType> = {
  "PUT /v1/attendance-permissions": z.object({
    days: z.number().int().min(0).max(366).nullable(),
    version: z.number().int().positive(),
    reason: z.string().min(5),
  }),
  "POST /v1/assessments/:id/marks/import/preview": z.object({
    csv: z.string().max(500000),
    reason: z.string().min(5),
  }),
  "PUT /v1/sections/:id/attendance/:date": z.object({
    records: z.array(attendanceRecord).max(500),
  }),
  "POST /v1/sections/:id/attendance/bulk": z.object({
    days: z.array(attendanceDay).min(1).max(100),
  }),
  "PUT /v1/assessments/:id/marks/bulk": z.object({
    entries: z.array(markInput).min(1).max(500),
  }),
  "PUT /v1/exam-cycles/:cycle/sections/:section/scheme": schemeSchema,
  "POST /v1/exam-cycles/:cycle/sections/:section/scheme/revise": z.object({
    scheme: schemeSchema,
    reason: text,
    copyMarks: z.boolean(),
  }),
  "PUT /v1/exam-cycles/:cycle/sections/:section/window": z.object({
    attendanceFrom: schoolDate,
    attendanceThrough: schoolDate,
    examStart: schoolDate.nullable(),
    examEnd: schoolDate.nullable(),
    acknowledgeOverlap: z.boolean().default(false),
  }),
  "POST /v1/results/:cycle/:section/publish": z.object({
    validationHash: z.string().length(64),
    correctionReason: z.string().min(5).optional(),
  }),
  "PUT /v1/policies": z.object({
    policy: z.record(z.string(), z.unknown()),
    approve: z.boolean(),
    version: z.number().int().positive(),
  }),
  "PUT /v1/sections/:id/calendar": z
    .array(
      z.object({
        schoolDate,
        isInstructional: z.boolean(),
        countsForAttendance: z.boolean(),
        note: z.string().max(200).optional(),
      }),
    )
    .max(366),
  "POST /v1/sections/:id/enrollments": z.object({
    student_id: uuid,
    roll_number: text,
    joined_on: schoolDate,
    left_on: schoolDate.nullable().optional(),
  }),
  "POST /v1/sections/:id/staff": z.object({
    user_id: uuid,
    role: z.enum(["CLASS_TEACHER", "AMEER", "ATTENDANCE_ASSISTANT"]),
    starts_on: schoolDate,
    ends_on: schoolDate.nullable().optional(),
    ameerOverrideReason: text.optional(),
  }),
  "POST /v1/sections/:id/subjects": z.object({
    subject_id: uuid,
    display_order: z.number().int().optional(),
  }),
  "POST /v1/offerings/:id/teachers": z.object({
    teacher_user_id: uuid,
    starts_on: schoolDate,
    ends_on: schoolDate.nullable().optional(),
  }),
  "PATCH /v1/users/:id": z.object({ active: z.boolean(), admin: z.boolean() }),
  "POST /v1/users/:id/reset-password": reason,
  "POST /v1/assessments/:id/reopen": reason,
  "POST /v1/sections/:id/attendance/:date/reopen": reason,
  "POST /v1/invitations": z.object({
    email: z.email(),
    name: z.string().min(1).max(150),
  }),
  "POST /v1/invitations/accept": z.object({
    token: z.string().length(64),
    password: z.string().min(12).max(128),
  }),
  "POST /v1/sections/:section/import/preview": z.object({
    csv: z.string().max(500000),
    columnMapping: z
      .object({
        student_number: text,
        full_name: text,
        roll_number: text,
        joined_on: text,
      })
      .optional(),
  }),
  "POST /v1/imports/:job/rollback": reason,
  "POST /v1/sections/:section/rollover": z.object({
    targetSection: uuid,
    joinedOn: schoolDate,
    enrollmentIds: z.array(uuid).min(1).max(500),
  }),
  "POST /v1/sections/:section/corrections": z.object({
    schoolDate,
    reason: text,
  }),
  "POST /v1/corrections/:id/review": z.object({
    approve: z.boolean(),
    reason: text,
  }),
  "PATCH /v1/staff/:id": z.object({
    active: z.boolean(),
    endsOn: schoolDate.nullable(),
    reason: text,
  }),
  "PATCH /v1/teaching/:id": z.object({ endsOn: schoolDate, reason: text }),
  "PATCH /v1/enrollments/:id": z.object({
    rollNumber: text,
    leftOn: schoolDate.nullable(),
    state: z.enum(["ACTIVE", "TRANSFERRED", "WITHDRAWN", "COMPLETED"]),
    reason: text,
  }),
  "POST /v1/exam-cycles": z.object({
    yearId: uuid,
    code: text,
    title: text,
    order: z.number().int(),
    attendanceFrom: schoolDate,
    attendanceThrough: schoolDate,
  }),
  "PATCH /v1/institute": z.object({
    name: text,
    name_ur: text,
    official_display_name: text,
    timezone: text,
  }),
};
for (const [route, r] of Object.entries(resources)) {
  bodySchemas[`POST /v1/${route}`] = r.schema;
  bodySchemas[`PATCH /v1/${route}/:id`] = r.schema.partial();
}
const json = (s: z.ZodType) =>
  z.toJSONSchema(s, { io: "input", unrepresentable: "any" });
export function openapi(app: FastifyInstance) {
  const paths: Record<string, any> = {};
  app.addHook("onRoute", (route: RouteOptions) => {
    if (!route.url.startsWith("/v1/") || route.url === "/v1/openapi.json")
      return;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const path = route.url.replace(/:([A-Za-z]+)/g, "{$1}");
    for (const method of methods) {
      if (method === "HEAD" || method === "OPTIONS") continue;
      const parameters: any[] = [...route.url.matchAll(/:([A-Za-z]+)/g)].map(
        (m) => ({
          name: m[1],
          in: "path",
          required: true,
          schema: {
            type: "string",
            ...(m[1] === "date" ? { format: "date" } : { format: "uuid" }),
          },
        }),
      );
      if (
        (route.url.endsWith("/attendance/bulk") ||
          route.url.endsWith("/publish")) &&
        method === "POST"
      )
        parameters.push({
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 8, maxLength: 100 },
        });
      if (
        (route.url.endsWith("/attendance/:date") && method === "PUT") ||
        route.url.endsWith("/attendance/:date/submit")
      )
        parameters.push({
          name: "If-Match",
          in: "header",
          required: true,
          schema: { type: "string", pattern: "^[0-9]+$" },
        });
      if (route.url.endsWith("/calendar") && method === "GET")
        parameters.push(
          ...["from", "through", "offset"].map((name) => ({
            name,
            in: "query",
            required: false,
            schema:
              name === "offset"
                ? { type: "integer", minimum: 0 }
                : { type: "string", format: "date" },
          })),
        );
      if (route.url.endsWith("/attendance.csv"))
        parameters.push(
          ...["from", "through"].map((name) => ({
            name,
            in: "query",
            required: true,
            schema: { type: "string", format: "date" },
          })),
        );
      const schema = bodySchemas[`${method} ${route.url}`];
      const pdf = route.url.endsWith(".pdf"),
        csv = route.url.endsWith(".csv");
      const response = {
        description:
          "Successful authenticated operation; see API module for workflow-specific fields",
        content: {
          [pdf ? "application/pdf" : csv ? "text/csv" : "application/json"]: {
            schema: pdf || csv ? { type: "string", format: "binary" } : {},
          },
        },
      };
      const operation: any = {
        operationId:
          method.toLowerCase() + route.url.replace(/[^A-Za-z0-9]/g, "_"),
        summary: `${method} ${route.url}`,
        tags: [route.url.split("/")[2]],
        parameters,
        responses: {
          200: response,
          ...(method === "POST" ? { 201: response } : {}),
          400: { description: "Invalid request" },
          401: { description: "Authentication required" },
          403: { description: "Role or resource scope denied" },
          404: { description: "Resource unavailable" },
          409: {
            description:
              "Optimistic version, uniqueness or serialization conflict",
          },
          422: { description: "Domain rule violation; no partial bulk write" },
        },
      };
      if (method === "POST" || method === "PUT" || method === "PATCH")
        operation.requestBody = {
          required: !!schema,
          content: {
            "application/json": {
              schema: schema ? json(schema) : { type: "object" },
            },
          },
        };
      if (route.url === "/v1/invitations/accept") operation.security = [];
      paths[path] ??= {};
      paths[path][method.toLowerCase()] = operation;
    }
  });
  app.get("/v1/openapi.json", async (req) => {
    await actor(req);
    return {
      openapi: "3.1.0",
      info: {
        title: "Hikmah Academic API",
        version: "1.0.0",
        description:
          "Generated from registered Fastify routes and shared Zod input schemas. Cross-table, role/scope, completeness and decimal-policy refinements are enforced by the API even where JSON Schema cannot express them. Approving a policy requires ApprovedPolicy, while incomplete policy drafts are permitted.",
      },
      servers: [{ url: "/" }],
      security: [{ bearerAuth: [] }, { cookieSession: [] }],
      paths,
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
          cookieSession: {
            type: "apiKey",
            in: "cookie",
            name: "better-auth.session_token",
          },
        },
        schemas: {
          ApprovedPolicy: json(policySchema),
          Scheme: json(schemeSchema),
          MarkInput: json(markInput),
          AttendanceDay: json(attendanceDay),
        },
      },
    };
  });
}
