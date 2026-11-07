import { markImport } from "./mark-import.ts";
import { openapi } from "./openapi.ts";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { auth } from "./auth.ts";
import { pool } from "./db.ts";
import { academics } from "./academics.ts";
import { attendance } from "./attendance.ts";
import { exams } from "./exams.ts";
import { results } from "./results.ts";
import { schemeRevisions } from "./scheme-revisions.ts";
import { operations } from "./operations.ts";
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    bodyLimit: 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });
  await app.register(helmet);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  app.addHook("onRequest", async (req, reply) => {
    if (req.method !== "GET" && req.headers.cookie) {
      const origin = req.headers.origin;
      const allowed = process.env.WEB_ORIGIN ?? "http://localhost:3000";
      if (origin !== allowed)
        return reply
          .code(403)
          .send({ message: "Trusted Origin required for cookie writes" });
    }
  });
  app.addHook("onSend", async (req, reply, payload) => {
    if (req.url.startsWith("/v1/"))
      reply.header("Cache-Control", "private, no-store");
    return payload;
  });
  app.setErrorHandler((e: any, _req, reply) => {
    if (e instanceof ZodError)
      return reply
        .code(400)
        .send({ message: "Invalid request", issues: e.issues });
    if (e.code === "40001" || e.code === "40P01" || e.code === "23505")
      return reply.code(409).send({
        message: "Concurrent change or duplicate record; refresh and retry",
      });
    if (e.code === "23514" || e.code === "23503" || e.code === "P0001")
      return reply.code(422).send({
        message:
          e.code === "P0001" ? e.message : "Invalid relationship or value",
      });
    if (e.statusCode && e.statusCode < 500)
      return reply.code(e.statusCode).send({ message: e.message });
    app.log.error({ err: e }, "Request failed");
    return reply.code(500).send({ message: "Internal error" });
  });
  app.get("/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok" };
  });
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
      }
      const response = await auth.handler(
        new Request(new URL(req.url, process.env.BETTER_AUTH_URL), {
          method: req.method,
          headers,
          ...(req.method !== "GET" ? { body: JSON.stringify(req.body) } : {}),
        }),
      );
      reply.code(response.status);
      response.headers.forEach((v, k) => {
        if (k !== "set-cookie") reply.header(k, v);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(await response.text());
    },
  });
  openapi(app);
  academics(app);
  attendance(app);
  exams(app);
  results(app);
  operations(app);
  schemeRevisions(app);
  markImport(app);
  return app;
}
