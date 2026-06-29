import { db, diplomaCourses, diplomaEnrollments, diplomaIntakes } from "@bh/db";
import {
  diplomaCourseCreateSchema,
  diplomaCourseUpdateSchema,
  diplomaIntakeCreateSchema,
  diplomaIntakeUpdateSchema
} from "@bh/shared";
import { and, asc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import {
  courseTeachersByCourseIds,
  courseTeachersForCourse,
  deleteCourseTeacherLinks,
  replaceCourseTeachers,
  type SerializedCourseTeacher
} from "./courseTeacherUtils";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

const COURSE_KIND = "diploma";

function serializeDiplomaCourse(course: typeof diplomaCourses.$inferSelect, teachers: SerializedCourseTeacher[] = []) {
  return {
    id: course.id,
    name: course.name,
    name_en: course.nameEn,
    content: course.content,
    teacher_id: course.teacherId,
    price_sgd: course.priceSgd,
    duration: course.duration,
    month_index: course.monthIndex,
    teachers,
    created_at: course.createdAt
  };
}

function serializeDiplomaIntake(intake: typeof diplomaIntakes.$inferSelect) {
  return {
    id: intake.id,
    course_id: intake.courseId,
    label: intake.label,
    start_date: intake.startDate,
    active: intake.active,
    sort_order: intake.sortOrder,
    created_at: intake.createdAt
  };
}

function serializeDiplomaEnrollment(
  enrollment: typeof diplomaEnrollments.$inferSelect,
  intake?: Pick<typeof diplomaIntakes.$inferSelect, "id" | "label"> | null
) {
  return {
    id: enrollment.id,
    student_id: enrollment.studentId,
    course_id: enrollment.courseId,
    intake_id: enrollment.intakeId,
    intake_label: intake?.label ?? null,
    program: enrollment.program,
    enroll_date: enrollment.enrollDate,
    billing_id: enrollment.billingId,
    installments_count: enrollment.installmentsCount,
    graduated: enrollment.graduated,
    created_at: enrollment.createdAt
  };
}

const courseIntakeParamsSchema = z.object({
  courseId: z.string().uuid(),
  id: z.string().uuid()
});

export async function registerDiplomaCourseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/diploma-courses", { preHandler: requirePerm("education.view") }, async () => {
    const courses = await db.select().from(diplomaCourses).orderBy(diplomaCourses.createdAt);
    const teachersByCourse = await courseTeachersByCourseIds(COURSE_KIND, courses.map((course) => course.id));

    return {
      courses: courses.map((course) => serializeDiplomaCourse(course, teachersByCourse.get(course.id) ?? []))
    };
  });

  app.get("/diploma-courses/:id", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [course] = await db.select().from(diplomaCourses).where(eq(diplomaCourses.id, id)).limit(1);

    if (!course) {
      return sendNotFound(reply);
    }

    return { course: serializeDiplomaCourse(course, await courseTeachersForCourse(COURSE_KIND, id)) };
  });

  app.post("/diploma-courses", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(diplomaCourseCreateSchema, request.body);
    const course = await db.transaction(async (tx) => {
      const [created] = await tx
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

      if (!created) {
        throw new Error("diploma_course_create_failed");
      }

      await replaceCourseTeachers(tx, COURSE_KIND, created.id, body.teacher_ids ?? []);
      return created;
    });

    return reply.code(201).send({ course: serializeDiplomaCourse(course, await courseTeachersForCourse(COURSE_KIND, course.id)) });
  });

  app.patch("/diploma-courses/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaCourseUpdateSchema, request.body);
    const course = await db.transaction(async (tx) => {
      const update: Partial<typeof diplomaCourses.$inferInsert> = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.name_en !== undefined) update.nameEn = body.name_en;
      if (body.content !== undefined) update.content = body.content;
      if (body.teacher_id !== undefined) update.teacherId = body.teacher_id;
      if (body.price_sgd !== undefined) update.priceSgd = toNumeric(body.price_sgd);
      if (body.duration !== undefined) update.duration = body.duration;
      if (body.month_index !== undefined) update.monthIndex = body.month_index;

      const [updated] =
        Object.keys(update).length > 0
          ? await tx.update(diplomaCourses).set(update).where(eq(diplomaCourses.id, id)).returning()
          : await tx.select().from(diplomaCourses).where(eq(diplomaCourses.id, id)).limit(1);

      if (updated && body.teacher_ids !== undefined) {
        await replaceCourseTeachers(tx, COURSE_KIND, updated.id, body.teacher_ids);
      }

      return updated;
    });

    if (!course) {
      return sendNotFound(reply);
    }

    return { course: serializeDiplomaCourse(course, await courseTeachersForCourse(COURSE_KIND, course.id)) };
  });

  app.delete("/diploma-courses/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.transaction(async (tx) => {
      await deleteCourseTeacherLinks(tx, COURSE_KIND, id);
      await tx.delete(diplomaCourses).where(eq(diplomaCourses.id, id));
    });
    return { ok: true };
  });

  app.get("/diploma-courses/:id/intakes", { preHandler: requirePerm("education.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const intakes = await db
      .select()
      .from(diplomaIntakes)
      .where(eq(diplomaIntakes.courseId, id))
      .orderBy(asc(diplomaIntakes.sortOrder), asc(diplomaIntakes.startDate), asc(diplomaIntakes.createdAt));

    return { intakes: intakes.map(serializeDiplomaIntake) };
  });

  app.post("/diploma-courses/:id/intakes", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaIntakeCreateSchema, {
      ...(request.body as Record<string, unknown>),
      course_id: id
    });
    const [intake] = await db
      .insert(diplomaIntakes)
      .values({
        courseId: body.course_id,
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

  app.patch("/diploma-courses/:courseId/intakes/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { courseId, id } = parseWithSchema(courseIntakeParamsSchema, request.params);
    const body = parseWithSchema(diplomaIntakeUpdateSchema, request.body);
    const [intake] = await db
      .update(diplomaIntakes)
      .set({
        label: body.label,
        startDate: body.start_date,
        active: body.active,
        sortOrder: body.sort_order
      })
      .where(and(eq(diplomaIntakes.id, id), eq(diplomaIntakes.courseId, courseId)))
      .returning();

    if (!intake) {
      return sendNotFound(reply);
    }

    return { intake: serializeDiplomaIntake(intake) };
  });

  app.delete("/diploma-courses/:courseId/intakes/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { courseId, id } = parseWithSchema(courseIntakeParamsSchema, request.params);
    await db.delete(diplomaIntakes).where(and(eq(diplomaIntakes.id, id), eq(diplomaIntakes.courseId, courseId)));
    return { ok: true };
  });

  app.get("/diploma-courses/:id/enrollments", { preHandler: requirePerm("education.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const enrollments = await db
      .select({
        enrollment: diplomaEnrollments,
        intake: {
          id: diplomaIntakes.id,
          label: diplomaIntakes.label
        }
      })
      .from(diplomaEnrollments)
      .leftJoin(diplomaIntakes, eq(diplomaEnrollments.intakeId, diplomaIntakes.id))
      .where(eq(diplomaEnrollments.courseId, id))
      .orderBy(diplomaEnrollments.createdAt);

    return { enrollments: enrollments.map((row) => serializeDiplomaEnrollment(row.enrollment, row.intake)) };
  });
}
