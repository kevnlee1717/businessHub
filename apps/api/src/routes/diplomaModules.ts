import { db, diplomaCourses, diplomaEnrollments, diplomaIntakes, diplomaModules } from "@bh/db";
import { diplomaModuleCreateSchema, diplomaModuleUpdateSchema } from "@bh/shared";
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

function serializeDiplomaModule(module: typeof diplomaModules.$inferSelect, teachers: SerializedCourseTeacher[] = []) {
  return {
    id: module.id,
    course_id: module.courseId,
    name: module.name,
    name_en: module.nameEn,
    content: module.content,
    teacher_id: module.teacherId,
    price_sgd: module.priceSgd,
    weeks: module.weeks,
    sort_order: module.sortOrder,
    teachers,
    created_at: module.createdAt
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
    module_id: enrollment.moduleId,
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

const diplomaModuleQuerySchema = z
  .object({
    course_id: z.string().uuid().optional()
  })
  .merge(paginationQuery);

export async function registerDiplomaModuleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/diploma-modules", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(diplomaModuleQuerySchema, request.query);
    const pagination = getPagination(query);
    const modules = query.course_id
      ? pagination.paginate
        ? await db
            .select()
            .from(diplomaModules)
            .where(eq(diplomaModules.courseId, query.course_id))
            .orderBy(diplomaModules.sortOrder, diplomaModules.createdAt)
            .limit(pagination.limit)
            .offset(pagination.offset)
        : await db
            .select()
            .from(diplomaModules)
            .where(eq(diplomaModules.courseId, query.course_id))
            .orderBy(diplomaModules.sortOrder, diplomaModules.createdAt)
      : pagination.paginate
        ? await db
            .select()
            .from(diplomaModules)
            .orderBy(diplomaModules.sortOrder, diplomaModules.createdAt)
            .limit(pagination.limit)
            .offset(pagination.offset)
        : await db.select().from(diplomaModules).orderBy(diplomaModules.sortOrder, diplomaModules.createdAt);
    const teachersByCourse = await courseTeachersByCourseIds(COURSE_KIND, modules.map((module) => module.id));

    if (!pagination.paginate) {
      return {
        modules: modules.map((module) => serializeDiplomaModule(module, teachersByCourse.get(module.id) ?? []))
      };
    }

    const [totalRow] = query.course_id
      ? await db.select({ count: count() }).from(diplomaModules).where(eq(diplomaModules.courseId, query.course_id))
      : await db.select({ count: count() }).from(diplomaModules);

    return {
      modules: modules.map((module) => serializeDiplomaModule(module, teachersByCourse.get(module.id) ?? [])),
      total: Number(totalRow?.count ?? 0),
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.get("/diploma-modules/:id", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [module] = await db.select().from(diplomaModules).where(eq(diplomaModules.id, id)).limit(1);

    if (!module) {
      return sendNotFound(reply);
    }

    return { module: serializeDiplomaModule(module, await courseTeachersForCourse(COURSE_KIND, id)) };
  });

  app.post("/diploma-modules", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(diplomaModuleCreateSchema, request.body);
    const module = await db.transaction(async (tx) => {
      if (body.course_id !== null && body.course_id !== undefined && body.sort_order !== null && body.sort_order !== undefined) {
        const [course] = await tx
          .select({ months: diplomaCourses.months })
          .from(diplomaCourses)
          .where(eq(diplomaCourses.id, body.course_id))
          .limit(1);

        if (course?.months !== null && course?.months !== undefined && (body.sort_order < 1 || body.sort_order > course.months)) {
          throw badRequest("diploma_month_out_of_range");
        }

        const [takenModule] = await tx
          .select({ id: diplomaModules.id })
          .from(diplomaModules)
          .where(and(eq(diplomaModules.courseId, body.course_id), eq(diplomaModules.sortOrder, body.sort_order)))
          .limit(1);

        if (takenModule) {
          throw badRequest("diploma_month_taken");
        }
      }

      const [created] = await tx
        .insert(diplomaModules)
        .values({
          name: body.name,
          courseId: body.course_id,
          nameEn: body.name_en,
          content: body.content,
          teacherId: body.teacher_id,
          priceSgd: toNumeric(body.price_sgd),
          weeks: body.weeks,
          sortOrder: body.sort_order
        })
        .returning();

      if (!created) {
        throw new Error("diploma_module_create_failed");
      }

      await replaceCourseTeachers(tx, COURSE_KIND, created.id, body.teacher_ids ?? []);
      return created;
    });

    return reply.code(201).send({ module: serializeDiplomaModule(module, await courseTeachersForCourse(COURSE_KIND, module.id)) });
  });

  app.patch("/diploma-modules/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaModuleUpdateSchema, request.body);
    const module = await db.transaction(async (tx) => {
      const [currentModule] = await tx.select().from(diplomaModules).where(eq(diplomaModules.id, id)).limit(1);

      if (!currentModule) {
        return undefined;
      }

      const effectiveCourseId = body.course_id !== undefined ? body.course_id : currentModule.courseId;
      const effectiveSortOrder = body.sort_order !== undefined ? body.sort_order : currentModule.sortOrder;

      if (effectiveCourseId !== null && effectiveCourseId !== undefined && effectiveSortOrder !== null && effectiveSortOrder !== undefined) {
        const [course] = await tx
          .select({ months: diplomaCourses.months })
          .from(diplomaCourses)
          .where(eq(diplomaCourses.id, effectiveCourseId))
          .limit(1);

        if (
          course?.months !== null &&
          course?.months !== undefined &&
          (effectiveSortOrder < 1 || effectiveSortOrder > course.months)
        ) {
          throw badRequest("diploma_month_out_of_range");
        }

        const [takenModule] = await tx
          .select({ id: diplomaModules.id })
          .from(diplomaModules)
          .where(
            and(
              eq(diplomaModules.courseId, effectiveCourseId),
              eq(diplomaModules.sortOrder, effectiveSortOrder),
              ne(diplomaModules.id, id)
            )
          )
          .limit(1);

        if (takenModule) {
          throw badRequest("diploma_month_taken");
        }
      }

      const update: Partial<typeof diplomaModules.$inferInsert> = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.course_id !== undefined) update.courseId = body.course_id;
      if (body.name_en !== undefined) update.nameEn = body.name_en;
      if (body.content !== undefined) update.content = body.content;
      if (body.teacher_id !== undefined) update.teacherId = body.teacher_id;
      if (body.price_sgd !== undefined) update.priceSgd = toNumeric(body.price_sgd);
      if (body.weeks !== undefined) update.weeks = body.weeks;
      if (body.sort_order !== undefined) update.sortOrder = body.sort_order;

      const [updated] =
        Object.keys(update).length > 0
          ? await tx.update(diplomaModules).set(update).where(eq(diplomaModules.id, id)).returning()
          : [currentModule];

      if (updated && body.teacher_ids !== undefined) {
        await replaceCourseTeachers(tx, COURSE_KIND, updated.id, body.teacher_ids);
      }

      return updated;
    });

    if (!module) {
      return sendNotFound(reply);
    }

    return { module: serializeDiplomaModule(module, await courseTeachersForCourse(COURSE_KIND, module.id)) };
  });

  app.delete("/diploma-modules/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.transaction(async (tx) => {
      await deleteCourseTeacherLinks(tx, COURSE_KIND, id);
      await tx.delete(diplomaModules).where(eq(diplomaModules.id, id));
    });
    return { ok: true };
  });

  app.get("/diploma-modules/:id/enrollments", { preHandler: requirePerm("education.view") }, async (request) => {
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
      .where(eq(diplomaEnrollments.moduleId, id))
      .orderBy(diplomaEnrollments.createdAt);

    return { enrollments: enrollments.map((row) => serializeDiplomaEnrollment(row.enrollment, row.intake)) };
  });
}
