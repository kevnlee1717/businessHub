import { db, students } from "@bh/db";
import { studentCreateSchema, studentUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeStudent(student: typeof students.$inferSelect) {
  return {
    id: student.id,
    name: student.name,
    name_en: student.nameEn,
    phone: student.phone,
    email: student.email,
    note: student.note,
    created_at: student.createdAt,
    updated_at: student.updatedAt
  };
}

export async function registerStudentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/students", { preHandler: requirePerm("education.view") }, async () => {
    const rows = await db.select().from(students).orderBy(students.name);
    return { students: rows.map(serializeStudent) };
  });

  app.get("/students/:id", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [student] = await db.select().from(students).where(eq(students.id, id)).limit(1);

    if (!student) {
      return sendNotFound(reply);
    }

    return { student: serializeStudent(student) };
  });

  app.post("/students", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(studentCreateSchema, request.body);
    const [student] = await db
      .insert(students)
      .values({
        name: body.name,
        nameEn: body.name_en,
        phone: body.phone,
        email: body.email,
        note: body.note
      })
      .returning();

    if (!student) {
      throw new Error("student_create_failed");
    }

    return reply.code(201).send({ student: serializeStudent(student) });
  });

  app.patch("/students/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(studentUpdateSchema, request.body);
    const [student] = await db
      .update(students)
      .set({
        name: body.name,
        nameEn: body.name_en,
        phone: body.phone,
        email: body.email,
        note: body.note,
        updatedAt: new Date()
      })
      .where(eq(students.id, id))
      .returning();

    if (!student) {
      return sendNotFound(reply);
    }

    return { student: serializeStudent(student) };
  });
}
