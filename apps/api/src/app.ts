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
import { ZodError } from "zod";
import { authenticate } from "./auth/jwt";
import { env } from "./env";
import { registerRoutes } from "./routes/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../..", "uploads");
const webDist = join(__dirname, "../../web/dist");
const webIndex = join(webDist, "index.html");

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
