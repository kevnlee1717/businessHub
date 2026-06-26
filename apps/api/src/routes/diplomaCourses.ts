import { db, diplomaCourses, diplomaEnrollments } from "@bh/db";
import { diplomaCourseCreateSchema, diplomaCourseUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

function serializeDiplomaCourse(course: typeof diplomaCourses.$inferSelect) {
  return {
    id: course.id,
    name: course.name,
    name_en: course.nameEn,
    content: course.content,
    teacher_id: course.teacherId,
    price_sgd: course.priceSgd,
    duration: course.duration,
    month_index: course.monthIndex,
    created_at: course.createdAt
  };
}

function serializeDiplomaEnrollment(enrollment: typeof diplomaEnrollments.$inferSelect) {
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

export async function registerDiplomaCourseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/diploma-courses", { preHandler: requirePerm("education.view") }, async () => {
    const courses = await db.select().from(diplomaCourses).orderBy(diplomaCourses.createdAt);

    return { courses: courses.map(serializeDiplomaCourse) };
  });

  app.get("/diploma-courses/:id", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [course] = await db.select().from(diplomaCourses).where(eq(diplomaCourses.id, id)).limit(1);

    if (!course) {
      return sendNotFound(reply);
    }

    return { course: serializeDiplomaCourse(course) };
  });

  app.post("/diploma-courses", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(diplomaCourseCreateSchema, request.body);
    const [course] = await db
      .insert(diplomaCourses)
      .values({
        name: body.name,
        nameEn: body.name_en,
        content: body.content,
        teacherId: body.teacher_id,
        priceSgd: toNumeric(body.price_sgd),
        duration: body.duration,
        monthIndex: body.month_index
      })
      .returning();

    if (!course) {
      throw new Error("diploma_course_create_failed");
    }

    return reply.code(201).send({ course: serializeDiplomaCourse(course) });
  });

  app.patch("/diploma-courses/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaCourseUpdateSchema, request.body);
    const [course] = await db
      .update(diplomaCourses)
      .set({
        name: body.name,
        nameEn: body.name_en,
        content: body.content,
        teacherId: body.teacher_id,
        priceSgd: toNumeric(body.price_sgd),
        duration: body.duration,
        monthIndex: body.month_index
      })
      .where(eq(diplomaCourses.id, id))
      .returning();

    if (!course) {
      return sendNotFound(reply);
    }

    return { course: serializeDiplomaCourse(course) };
  });

  app.delete("/diploma-courses/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(diplomaCourses).where(eq(diplomaCourses.id, id));
    return { ok: true };
  });

  app.get("/diploma-courses/:id/enrollments", { preHandler: requirePerm("education.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const enrollments = await db
      .select()
      .from(diplomaEnrollments)
      .where(eq(diplomaEnrollments.courseId, id))
      .orderBy(diplomaEnrollments.createdAt);

    return { enrollments: enrollments.map(serializeDiplomaEnrollment) };
  });
}
