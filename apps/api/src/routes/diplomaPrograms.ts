import { db, diplomaIntakes, diplomaPrograms } from "@bh/db";
import {
  diplomaIntakeCreateSchema,
  diplomaIntakeUpdateSchema,
  diplomaProgramCreateSchema,
  diplomaProgramUpdateSchema
} from "@bh/shared";
import { and, asc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeDiplomaProgram(program: typeof diplomaPrograms.$inferSelect) {
  return {
    id: program.id,
    name: program.name,
    name_en: program.nameEn,
    active: program.active,
    sort_order: program.sortOrder,
    created_at: program.createdAt
  };
}

function serializeDiplomaIntake(intake: typeof diplomaIntakes.$inferSelect) {
  return {
    id: intake.id,
    program_id: intake.programId,
    label: intake.label,
    start_date: intake.startDate,
    active: intake.active,
    sort_order: intake.sortOrder,
    created_at: intake.createdAt
  };
}

const programIntakeParamsSchema = z.object({
  programId: z.string().uuid(),
  id: z.string().uuid()
});

export async function registerDiplomaProgramRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/diploma-programs", { preHandler: requirePerm("education.view") }, async () => {
    const programs = await db.select().from(diplomaPrograms).orderBy(diplomaPrograms.sortOrder, diplomaPrograms.name);
    return { programs: programs.map(serializeDiplomaProgram) };
  });

  app.get("/diploma-programs/:id", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [program] = await db.select().from(diplomaPrograms).where(eq(diplomaPrograms.id, id)).limit(1);

    if (!program) {
      return sendNotFound(reply);
    }

    return { program: serializeDiplomaProgram(program) };
  });

  app.post("/diploma-programs", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(diplomaProgramCreateSchema, request.body);
    const [program] = await db
      .insert(diplomaPrograms)
      .values({
        name: body.name,
        nameEn: body.name_en,
        active: body.active,
        sortOrder: body.sort_order
      })
      .returning();

    if (!program) {
      throw new Error("diploma_program_create_failed");
    }

    return reply.code(201).send({ program: serializeDiplomaProgram(program) });
  });

  app.patch("/diploma-programs/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaProgramUpdateSchema, request.body);
    const [program] = await db
      .update(diplomaPrograms)
      .set({
        name: body.name,
        nameEn: body.name_en,
        active: body.active,
        sortOrder: body.sort_order
      })
      .where(eq(diplomaPrograms.id, id))
      .returning();

    if (!program) {
      return sendNotFound(reply);
    }

    return { program: serializeDiplomaProgram(program) };
  });

  app.delete("/diploma-programs/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(diplomaPrograms).where(eq(diplomaPrograms.id, id));
    return { ok: true };
  });

  app.get("/diploma-programs/:id/intakes", { preHandler: requirePerm("education.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const intakes = await db
      .select()
      .from(diplomaIntakes)
      .where(eq(diplomaIntakes.programId, id))
      .orderBy(asc(diplomaIntakes.sortOrder), asc(diplomaIntakes.startDate), asc(diplomaIntakes.createdAt));

    return { intakes: intakes.map(serializeDiplomaIntake) };
  });

  app.post("/diploma-programs/:id/intakes", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaIntakeCreateSchema, {
      ...(request.body as Record<string, unknown>),
      program_id: id
    });
    const [intake] = await db
      .insert(diplomaIntakes)
      .values({
        programId: body.program_id,
        label: body.label,
        startDate: body.start_date,
        active: body.active,
        sortOrder: body.sort_order
      })
      .returning();

    if (!intake) {
      throw new Error("diploma_intake_create_failed");
    }

    return reply.code(201).send({ intake: serializeDiplomaIntake(intake) });
  });

  app.patch("/diploma-programs/:programId/intakes/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { programId, id } = parseWithSchema(programIntakeParamsSchema, request.params);
    const body = parseWithSchema(diplomaIntakeUpdateSchema, request.body);
    const [intake] = await db
      .update(diplomaIntakes)
      .set({
        label: body.label,
        startDate: body.start_date,
        active: body.active,
        sortOrder: body.sort_order
      })
      .where(and(eq(diplomaIntakes.id, id), eq(diplomaIntakes.programId, programId)))
      .returning();

    if (!intake) {
      return sendNotFound(reply);
    }

    return { intake: serializeDiplomaIntake(intake) };
  });

  app.delete("/diploma-programs/:programId/intakes/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { programId, id } = parseWithSchema(programIntakeParamsSchema, request.params);
    await db.delete(diplomaIntakes).where(and(eq(diplomaIntakes.id, id), eq(diplomaIntakes.programId, programId)));
    return { ok: true };
  });
}
