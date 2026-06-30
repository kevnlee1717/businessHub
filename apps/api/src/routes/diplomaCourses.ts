import { db, diplomaCourses, diplomaEnrollments, diplomaIntakes, diplomaPrograms } from "@bh/db";
import { diplomaCourseCreateSchema, diplomaCourseUpdateSchema } from "@bh/shared";
import { and, count, eq, ne } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import {
  courseTeachersByCourseIds,
  courseTeachersForCourse,
  deleteCourseTeacherLinks,
  replaceCourseTeachers,
  type SerializedCourseTeacher
} from "./courseTeacherUtils";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

const COURSE_KIND = "diploma";

function badRequest(message: "diploma_month_out_of_range" | "diploma_month_taken") {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}

function serializeDiplomaCourse(course: typeof diplomaCourses.$inferSelect, teachers: SerializedCourseTeacher[] = []) {
  return {
    id: course.id,
    program_id: course.programId,
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

function serializeDiplomaEnrollment(
  enrollment: typeof diplomaEnrollments.$inferSelect,
  intake?: Pick<typeof diplomaIntakes.$inferSelect, "id" | "label"> | null
) {
  return {
    id: enrollment.id,
    student_id: enrollment.studentId,
    program_id: enrollment.programId,
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

const diplomaCourseQuerySchema = z
  .object({
    program_id: z.string().uuid().optional()
  })
  .merge(paginationQuery);

export async function registerDiplomaCourseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/diploma-courses", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(diplomaCourseQuerySchema, request.query);
    const pagination = getPagination(query);
    const courses = query.program_id
      ? pagination.paginate
        ? await db
            .select()
            .from(diplomaCourses)
            .where(eq(diplomaCourses.programId, query.program_id))
            .orderBy(diplomaCourses.createdAt)
            .limit(pagination.limit)
            .offset(pagination.offset)
        : await db
            .select()
            .from(diplomaCourses)
            .where(eq(diplomaCourses.programId, query.program_id))
            .orderBy(diplomaCourses.createdAt)
      : pagination.paginate
        ? await db
            .select()
            .from(diplomaCourses)
            .orderBy(diplomaCourses.createdAt)
            .limit(pagination.limit)
            .offset(pagination.offset)
        : await db.select().from(diplomaCourses).orderBy(diplomaCourses.createdAt);
    const teachersByCourse = await courseTeachersByCourseIds(COURSE_KIND, courses.map((course) => course.id));

    if (!pagination.paginate) {
      return {
        courses: courses.map((course) => serializeDiplomaCourse(course, teachersByCourse.get(course.id) ?? []))
      };
    }

    const [totalRow] = query.program_id
      ? await db.select({ count: count() }).from(diplomaCourses).where(eq(diplomaCourses.programId, query.program_id))
      : await db.select({ count: count() }).from(diplomaCourses);

    return {
      courses: courses.map((course) => serializeDiplomaCourse(course, teachersByCourse.get(course.id) ?? [])),
      total: Number(totalRow?.count ?? 0),
      page: pagination.page,
      page_size: pagination.pageSize
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
      if (body.program_id !== null && body.program_id !== undefined && body.month_index !== null && body.month_index !== undefined) {
        const [program] = await tx
          .select({ months: diplomaPrograms.months })
          .from(diplomaPrograms)
          .where(eq(diplomaPrograms.id, body.program_id))
          .limit(1);

        if (program?.months !== null && program?.months !== undefined && (body.month_index < 1 || body.month_index > program.months)) {
          throw badRequest("diploma_month_out_of_range");
        }

        const [takenCourse] = await tx
          .select({ id: diplomaCourses.id })
          .from(diplomaCourses)
          .where(and(eq(diplomaCourses.programId, body.program_id), eq(diplomaCourses.monthIndex, body.month_index)))
          .limit(1);

        if (takenCourse) {
          throw badRequest("diploma_month_taken");
        }
      }

      const [created] = await tx
        .insert(diplomaCourses)
        .values({
          name: body.name,
          programId: body.program_id,
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
      const [currentCourse] = await tx.select().from(diplomaCourses).where(eq(diplomaCourses.id, id)).limit(1);

      if (!currentCourse) {
        return undefined;
      }

      const effectiveProgramId = body.program_id !== undefined ? body.program_id : currentCourse.programId;
      const effectiveMonthIndex = body.month_index !== undefined ? body.month_index : currentCourse.monthIndex;

      if (effectiveProgramId !== null && effectiveProgramId !== undefined && effectiveMonthIndex !== null && effectiveMonthIndex !== undefined) {
        const [program] = await tx
          .select({ months: diplomaPrograms.months })
          .from(diplomaPrograms)
          .where(eq(diplomaPrograms.id, effectiveProgramId))
          .limit(1);

        if (
          program?.months !== null &&
          program?.months !== undefined &&
          (effectiveMonthIndex < 1 || effectiveMonthIndex > program.months)
        ) {
          throw badRequest("diploma_month_out_of_range");
        }

        const [takenCourse] = await tx
          .select({ id: diplomaCourses.id })
          .from(diplomaCourses)
          .where(
            and(
              eq(diplomaCourses.programId, effectiveProgramId),
              eq(diplomaCourses.monthIndex, effectiveMonthIndex),
              ne(diplomaCourses.id, id)
            )
          )
          .limit(1);

        if (takenCourse) {
          throw badRequest("diploma_month_taken");
        }
      }

      const update: Partial<typeof diplomaCourses.$inferInsert> = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.program_id !== undefined) update.programId = body.program_id;
      if (body.name_en !== undefined) update.nameEn = body.name_en;
      if (body.content !== undefined) update.content = body.content;
      if (body.teacher_id !== undefined) update.teacherId = body.teacher_id;
      if (body.price_sgd !== undefined) update.priceSgd = toNumeric(body.price_sgd);
      if (body.duration !== undefined) update.duration = body.duration;
      if (body.month_index !== undefined) update.monthIndex = body.month_index;

      const [updated] =
        Object.keys(update).length > 0
          ? await tx.update(diplomaCourses).set(update).where(eq(diplomaCourses.id, id)).returning()
          : [currentCourse];

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
