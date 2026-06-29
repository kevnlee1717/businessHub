import { db, teachers } from "@bh/db";
import { teacherCreateSchema, teacherUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const teacherQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional()
});

function serializeTeacher(teacher: typeof teachers.$inferSelect) {
  return {
    id: teacher.id,
    name: teacher.name,
    name_en: teacher.nameEn,
    phone: teacher.phone,
    note: teacher.note,
    active: teacher.active,
    created_at: teacher.createdAt
  };
}

export async function registerTeacherRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/teachers", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(teacherQuerySchema, request.query);
    const active = query.active === undefined ? undefined : query.active === "true";
    const rows = active === undefined
      ? await db.select().from(teachers).orderBy(teachers.name, teachers.createdAt)
      : await db.select().from(teachers).where(eq(teachers.active, active)).orderBy(teachers.name, teachers.createdAt);

    return { teachers: rows.map(serializeTeacher) };
  });

  app.post("/teachers", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(teacherCreateSchema, request.body);
    const [teacher] = await db
      .insert(teachers)
      .values({
        name: body.name,
        nameEn: body.name_en,
        phone: body.phone,
        note: body.note,
        active: body.active
      })
      .returning();

    if (!teacher) {
      throw new Error("teacher_create_failed");
    }

    return reply.code(201).send({ teacher: serializeTeacher(teacher) });
  });

  app.patch("/teachers/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(teacherUpdateSchema, request.body);
    const [teacher] = await db
      .update(teachers)
      .set({
        name: body.name,
        nameEn: body.name_en,
        phone: body.phone,
        note: body.note,
        active: body.active
      })
      .where(eq(teachers.id, id))
      .returning();

    if (!teacher) {
      return sendNotFound(reply);
    }

    return { teacher: serializeTeacher(teacher) };
  });

  app.delete("/teachers/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(teachers).where(eq(teachers.id, id));
    return { ok: true };
  });
}
