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
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
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
