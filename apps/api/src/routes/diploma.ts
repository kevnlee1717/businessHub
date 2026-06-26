import { db, diplomaEnrollments } from "@bh/db";
import { diplomaEnrollmentCreateSchema, diplomaEnrollmentUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeDiploma(enrollment: typeof diplomaEnrollments.$inferSelect) {
  return {
    id: enrollment.id,
    student_id: enrollment.studentId,
    course_id: enrollment.courseId,
    program: enrollment.program,
    enroll_date: enrollment.enrollDate,
    billing_id: enrollment.billingId,
    installments_count: enrollment.installmentsCount,
    graduated: enrollment.graduated,
    created_at: enrollment.createdAt
  };
}

const diplomaEnrollmentQuerySchema = z.object({
  student_id: z.string().uuid().optional()
});

export async function registerDiplomaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/diploma-enrollments", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(diplomaEnrollmentQuerySchema, request.query);
    const rows = query.student_id
      ? await db
          .select()
          .from(diplomaEnrollments)
          .where(eq(diplomaEnrollments.studentId, query.student_id))
          .orderBy(diplomaEnrollments.createdAt)
      : await db.select().from(diplomaEnrollments).orderBy(diplomaEnrollments.createdAt);

    return { enrollments: rows.map(serializeDiploma) };
  });

  app.post("/diploma-enrollments", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(diplomaEnrollmentCreateSchema, request.body);
    const [enrollment] = await db
      .insert(diplomaEnrollments)
      .values({
        studentId: body.student_id,
        courseId: body.course_id,
        program: body.program,
        enrollDate: body.enroll_date,
        billingId: body.billing_id,
        installmentsCount: body.installments_count,
        graduated: body.graduated
      })
      .returning();

    if (!enrollment) {
      throw new Error("diploma_enrollment_create_failed");
    }

    return reply.code(201).send({ enrollment: serializeDiploma(enrollment) });
  });

  app.patch("/diploma-enrollments/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaEnrollmentUpdateSchema, request.body);
    const [enrollment] = await db
      .update(diplomaEnrollments)
      .set({
        studentId: body.student_id,
        courseId: body.course_id,
        program: body.program,
        enrollDate: body.enroll_date,
        billingId: body.billing_id,
        installmentsCount: body.installments_count,
        graduated: body.graduated
      })
      .where(eq(diplomaEnrollments.id, id))
      .returning();

    if (!enrollment) {
      return sendNotFound(reply);
    }

    return { enrollment: serializeDiploma(enrollment) };
  });
}
