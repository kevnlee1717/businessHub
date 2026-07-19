import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastify from "fastify";
import { ZodError, type ZodIssue } from "zod";
import { authenticate } from "./auth/jwt";
import { env } from "./env";
import { registerRoutes } from "./routes/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../..", "uploads");
const webDist = join(__dirname, "../../web/dist");
const webIndex = join(webDist, "index.html");

// zod issue → 人话（中文），给前端/桥对端直接展示用
function zodIssueMessage(issue: ZodIssue): string {
  const path = issue.path.join(".") || "参数";
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" || issue.received === "null"
        ? `${path}：必填`
        : `${path}：类型不对（应为 ${issue.expected}）`;
    case "invalid_enum_value":
      return `${path}：只能是 ${issue.options.join(" / ")}`;
    case "too_small":
      if (issue.type === "string") return `${path}：不能为空`;
      if (issue.type === "array") return `${path}：至少 ${issue.minimum} 项`;
      return `${path}：不能小于 ${issue.minimum}`;
    case "too_big":
      if (issue.type === "string") return `${path}：太长（最多 ${issue.maximum} 字）`;
      return `${path}：不能大于 ${issue.maximum}`;
    case "invalid_string":
      return `${path}：格式不对`;
    default:
      return `${path}：${issue.message}`;
  }
}

function isHttpError(error: unknown): error is { statusCode: number; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number" &&
    (error as { statusCode: number }).statusCode >= 400 &&
    (error as { statusCode: number }).statusCode < 500
  );
}

export async function buildApp() {
  await mkdir(uploadRoot, { recursive: true });

  const app = fastify({
    logger: true
  });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || origin === "http://localhost:5173") {
        callback(null, true);
        return;
      }

      callback(null, true);
    },
    credentials: true
  });

  await app.register(cookie);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: "bh_token",
      signed: false
    }
  });

  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024
    }
  });

  await app.register(fastifyStatic, {
    root: uploadRoot,
    prefix: "/uploads/"
  });

  app.decorate("authenticate", authenticate);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        message: error.issues.map(zodIssueMessage).join("；"),
        issues: error.issues
      });
    }

    if (isHttpError(error)) {
      return reply.code(error.statusCode ?? 500).send({
        error: error.message
      });
    }

    app.log.error(error);

    return reply.code(500).send({
      error: "internal_server_error"
    });
  });

  await app.register(registerRoutes, { prefix: "/api" });

  if (existsSync(webIndex)) {
    const indexHtml = readFileSync(webIndex);

    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      decorateReply: false
    });

    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url ?? "";

      if (url.startsWith("/api") || url.startsWith("/uploads")) {
        return reply.code(404).send({ error: "not_found" });
      }

      return reply.type("text/html").send(indexHtml);
    });
  }

  return app;
}
