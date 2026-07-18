import { type FastifyReply } from "fastify";
import { z } from "zod";

export const idParamsSchema = z.object({
  id: z.string().uuid()
});

export function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function toNumeric(value: string | number | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return String(value);
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { code?: unknown }).code === "23505") return true;
  // drizzle-orm ≥0.36 把驱动错误包成 DrizzleQueryError，pg 的 code 在 cause 上
  return isUniqueViolation((error as { cause?: unknown }).cause);
}

export function sendNotFound(reply: FastifyReply) {
  return reply.code(404).send({ error: "not_found" });
}

export function sendConflict(reply: FastifyReply, error = "conflict") {
  return reply.code(409).send({ error });
}

export function endOfDate(date: string): Date {
  return new Date(`${date}T23:59:59.999`);
}
