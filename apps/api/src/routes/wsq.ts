import { db, wsqCourses, wsqEnrollments } from "@bh/db";
import { wsqCourseCreateSchema, wsqCourseUpdateSchema, wsqEnrollmentCreateSchema } from "@bh/shared";
import { eq, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

type CourseStats = {
  enrollmentCount: number;
  canOpen: boolean;
};

function serializeWsqCourse(course: typeof wsqCourses.$inferSelect, stats?: CourseStats) {
  const enrollmentCount = stats?.enrollmentCount ?? 0;

  return {
    id: course.id,
    name: course.name,
    name_en: course.nameEn,
    content: course.content,
    start_date: course.startDate,
    duration: course.duration,
    teacher_id: course.teacherId,
    price_sgd: course.priceSgd,
    min_students: course.minStudents,
    enrollment_count: enrollmentCount,
    can_open: stats?.canOpen ?? enrollmentCount >= (course.minStudents ?? 0),
    created_at: course.createdAt
  };
}

function serializeWsqEnrollment(enrollment: typeof wsqEnrollments.$inferSelect) {
  return {
    id: enrollment.id,
    student_id: enrollment.studentId,
    course_id: enrollment.courseId,
    billing_id: enrollment.billingId,
    created_at: enrollment.createdAt
  };
}

async function enrollmentCountsByCourse(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      courseId: wsqEnrollments.courseId,
      enrollmentCount: sql<number>`count(*)::int`
    })
    .from(wsqEnrollments)
    .groupBy(wsqEnrollments.courseId);

  return new Map(rows.map((row) => [row.courseId, row.enrollmentCount]));
}

async function enrollmentCountForCourse(courseId: string): Promise<number> {
  const [row] = await db
    .select({
      enrollmentCount: sql<number>`count(*)::int`
    })
    .from(wsqEnrollments)
    .where(eq(wsqEnrollments.courseId, courseId));

  return row?.enrollmentCount ?? 0;
}

export async function registerWsqRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/wsq-courses", { preHandler: requirePerm("education.view") }, async () => {
    const [courses, counts] = await Promise.all([
      db.select().from(wsqCourses).orderBy(wsqCourses.createdAt),
      enrollmentCountsByCourse()
    ]);

    return {
      courses: courses.map((course) => {
        const enrollmentCount = counts.get(course.id) ?? 0;
        return serializeWsqCourse(course, {
          enrollmentCount,
          canOpen: enrollmentCount >= (course.minStudents ?? 0)
        });
      })
    };
  });

  app.get("/wsq-courses/:id", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [course] = await db.select().from(wsqCourses).where(eq(wsqCourses.id, id)).limit(1);

    if (!course) {
      return sendNotFound(reply);
    }

    const enrollmentCount = await enrollmentCountForCourse(id);
    return {
      course: serializeWsqCourse(course, {
        enrollmentCount,
        canOpen: enrollmentCount >= (course.minStudents ?? 0)
      })
    };
  });

  app.post("/wsq-courses", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(wsqCourseCreateSchema, request.body);
    const [course] = await db
      .insert(wsqCourses)
      .values({
        name: body.name,
        nameEn: body.name_en,
        content: body.content,
        startDate: body.start_date,
        duration: body.duration,
        teacherId: body.teacher_id,
        priceSgd: toNumeric(body.price_sgd),
        minStudents: body.min_students
      })
      .returning();

    if (!course) {
      throw new Error("wsq_course_create_failed");
    }

    return reply.code(201).send({ course: serializeWsqCourse(course) });
  });

  app.patch("/wsq-courses/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(wsqCourseUpdateSchema, request.body);
    const [course] = await db
      .update(wsqCourses)
      .set({
        name: body.name,
        nameEn: body.name_en,
        content: body.content,
        startDate: body.start_date,
        duration: body.duration,
        teacherId: body.teacher_id,
        priceSgd: toNumeric(body.price_sgd),
        minStudents: body.min_students
      })
      .where(eq(wsqCourses.id, id))
      .returning();

    if (!course) {
      return sendNotFound(reply);
    }

    const enrollmentCount = await enrollmentCountForCourse(id);
    return {
      course: serializeWsqCourse(course, {
        enrollmentCount,
        canOpen: enrollmentCount >= (course.minStudents ?? 0)
      })
    };
  });

  app.get("/wsq-courses/:id/enrollments", { preHandler: requirePerm("education.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select()
      .from(wsqEnrollments)
      .where(eq(wsqEnrollments.courseId, id))
      .orderBy(wsqEnrollments.createdAt);

    return { enrollments: rows.map(serializeWsqEnrollment) };
  });

  app.post("/wsq-enrollments", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(wsqEnrollmentCreateSchema, request.body);
    const [enrollment] = await db
      .insert(wsqEnrollments)
      .values({
        studentId: body.student_id,
        courseId: body.course_id,
        billingId: body.billing_id
      })
      .returning();

    if (!enrollment) {
      throw new Error("wsq_enrollment_create_failed");
    }

    return reply.code(201).send({ enrollment: serializeWsqEnrollment(enrollment) });
  });

  app.delete("/wsq-enrollments/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(wsqEnrollments).where(eq(wsqEnrollments.id, id));
    return { ok: true };
  });
}
