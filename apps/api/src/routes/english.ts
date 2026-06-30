import { db, englishAttendance, englishClasses, englishEnrollments, englishLevels } from "@bh/db";
import {
  englishAttendanceMarkSchema,
  englishClassAttendanceSchema,
  englishClassCreateSchema,
  englishClassUpdateSchema,
  englishEnrollmentCreateSchema,
  englishLevelCreateSchema,
  englishLevelUpdateSchema
} from "@bh/shared";
import { and, count, eq, sql } from "drizzle-orm";
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

const CLASS_COURSE_KIND = "english";

function serializeLevel(level: typeof englishLevels.$inferSelect) {
  return {
    id: level.id,
    name: level.name,
    name_en: level.nameEn,
    level: level.level,
    price_sgd: level.priceSgd,
    duration: level.duration,
    created_at: level.createdAt
  };
}

function serializeClass(englishClass: typeof englishClasses.$inferSelect, teachers: SerializedCourseTeacher[] = []) {
  return {
    id: englishClass.id,
    level_id: englishClass.levelId,
    teacher_id: englishClass.teacherId,
    teachers,
    schedule: englishClass.schedule,
    start_date: englishClass.startDate,
    end_date: englishClass.endDate,
    created_at: englishClass.createdAt
  };
}

function serializeEnrollment(enrollment: typeof englishEnrollments.$inferSelect) {
  return {
    id: enrollment.id,
    student_id: enrollment.studentId,
    class_id: enrollment.classId,
    level_id: enrollment.levelId,
    enroll_date: enrollment.enrollDate,
    billing_id: enrollment.billingId,
    created_at: enrollment.createdAt
  };
}

function serializeAttendance(attendance: typeof englishAttendance.$inferSelect) {
  return {
    id: attendance.id,
    enrollment_id: attendance.enrollmentId,
    session_date: attendance.sessionDate,
    present: attendance.present,
    created_at: attendance.createdAt
  };
}

const englishClassQuerySchema = z
  .object({
    level_id: z.string().uuid().optional(),
    teacher_id: z.string().uuid().optional()
  })
  .merge(paginationQuery);

const englishEnrollmentQuerySchema = z
  .object({
    class_id: z.string().uuid().optional(),
    student_id: z.string().uuid().optional()
  })
  .merge(paginationQuery);

export async function registerEnglishRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/english-levels", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(paginationQuery, request.query);
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select()
          .from(englishLevels)
          .orderBy(englishLevels.level, englishLevels.name)
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(englishLevels).orderBy(englishLevels.level, englishLevels.name);

    if (!pagination.paginate) {
      return { levels: rows.map(serializeLevel) };
    }

    const [totalRow] = await db.select({ count: count() }).from(englishLevels);
    return {
      levels: rows.map(serializeLevel),
      total: Number(totalRow?.count ?? 0),
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.post("/english-levels", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(englishLevelCreateSchema, request.body);
    const [level] = await db
      .insert(englishLevels)
      .values({
        name: body.name,
        nameEn: body.name_en,
        level: body.level,
        priceSgd: toNumeric(body.price_sgd),
        duration: body.duration
      })
      .returning();

    if (!level) {
      throw new Error("english_level_create_failed");
    }

    return reply.code(201).send({ level: serializeLevel(level) });
  });

  app.patch("/english-levels/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(englishLevelUpdateSchema, request.body);
    const [level] = await db
      .update(englishLevels)
      .set({
        name: body.name,
        nameEn: body.name_en,
        level: body.level,
        priceSgd: toNumeric(body.price_sgd),
        duration: body.duration
      })
      .where(eq(englishLevels.id, id))
      .returning();

    if (!level) {
      return sendNotFound(reply);
    }

    return { level: serializeLevel(level) };
  });

  app.get("/english-classes", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(englishClassQuerySchema, request.query);
    const filters = [];
    const pagination = getPagination(query);

    if (query.level_id) {
      filters.push(eq(englishClasses.levelId, query.level_id));
    }

    if (query.teacher_id) {
      filters.push(eq(englishClasses.teacherId, query.teacher_id));
    }

    const whereClause = filters.length > 0 ? and(...filters) : sql`true`;
    const rows = pagination.paginate
      ? await db
          .select()
          .from(englishClasses)
          .where(whereClause)
          .orderBy(englishClasses.createdAt)
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(englishClasses).where(whereClause).orderBy(englishClasses.createdAt);
    const teachersByCourse = await courseTeachersByCourseIds(CLASS_COURSE_KIND, rows.map((row) => row.id));

    if (!pagination.paginate) {
      return { classes: rows.map((row) => serializeClass(row, teachersByCourse.get(row.id) ?? [])) };
    }

    const [totalRow] = await db.select({ count: count() }).from(englishClasses).where(whereClause);
    return {
      classes: rows.map((row) => serializeClass(row, teachersByCourse.get(row.id) ?? [])),
      total: Number(totalRow?.count ?? 0),
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.get("/english-classes/:id", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [englishClass] = await db.select().from(englishClasses).where(eq(englishClasses.id, id)).limit(1);

    if (!englishClass) {
      return sendNotFound(reply);
    }

    return { class: serializeClass(englishClass, await courseTeachersForCourse(CLASS_COURSE_KIND, id)) };
  });

  app.post("/english-classes", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(englishClassCreateSchema, request.body);
    const englishClass = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(englishClasses)
        .values({
          levelId: body.level_id,
          teacherId: body.teacher_id,
          schedule: body.schedule,
          startDate: body.start_date,
          endDate: body.end_date
        })
        .returning();

      if (!created) {
        throw new Error("english_class_create_failed");
      }

      await replaceCourseTeachers(tx, CLASS_COURSE_KIND, created.id, body.teacher_ids ?? []);
      return created;
    });

    return reply
      .code(201)
      .send({ class: serializeClass(englishClass, await courseTeachersForCourse(CLASS_COURSE_KIND, englishClass.id)) });
  });

  app.patch("/english-classes/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(englishClassUpdateSchema, request.body);
    const englishClass = await db.transaction(async (tx) => {
      const update: Partial<typeof englishClasses.$inferInsert> = {};
      if (body.level_id !== undefined) update.levelId = body.level_id;
      if (body.teacher_id !== undefined) update.teacherId = body.teacher_id;
      if (body.schedule !== undefined) update.schedule = body.schedule;
      if (body.start_date !== undefined) update.startDate = body.start_date;
      if (body.end_date !== undefined) update.endDate = body.end_date;

      const [updated] =
        Object.keys(update).length > 0
          ? await tx.update(englishClasses).set(update).where(eq(englishClasses.id, id)).returning()
          : await tx.select().from(englishClasses).where(eq(englishClasses.id, id)).limit(1);

      if (updated && body.teacher_ids !== undefined) {
        await replaceCourseTeachers(tx, CLASS_COURSE_KIND, updated.id, body.teacher_ids);
      }

      return updated;
    });

    if (!englishClass) {
      return sendNotFound(reply);
    }

    return { class: serializeClass(englishClass, await courseTeachersForCourse(CLASS_COURSE_KIND, englishClass.id)) };
  });

  app.delete("/english-classes/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.transaction(async (tx) => {
      await deleteCourseTeacherLinks(tx, CLASS_COURSE_KIND, id);
      await tx.delete(englishClasses).where(eq(englishClasses.id, id));
    });
    return { ok: true };
  });

  app.get("/english-classes/:id/enrollments", { preHandler: requirePerm("education.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select()
      .from(englishEnrollments)
      .where(eq(englishEnrollments.classId, id))
      .orderBy(englishEnrollments.createdAt);

    return { enrollments: rows.map(serializeEnrollment) };
  });

  app.get("/english-enrollments", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(englishEnrollmentQuerySchema, request.query);
    const filters = [];
    const pagination = getPagination(query);

    if (query.class_id) {
      filters.push(eq(englishEnrollments.classId, query.class_id));
    }

    if (query.student_id) {
      filters.push(eq(englishEnrollments.studentId, query.student_id));
    }

    const whereClause = filters.length > 0 ? and(...filters) : sql`true`;
    const rows = pagination.paginate
      ? await db
          .select()
          .from(englishEnrollments)
          .where(whereClause)
          .orderBy(englishEnrollments.createdAt)
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(englishEnrollments).where(whereClause).orderBy(englishEnrollments.createdAt);

    if (!pagination.paginate) {
      return { enrollments: rows.map(serializeEnrollment) };
    }

    const [totalRow] = await db.select({ count: count() }).from(englishEnrollments).where(whereClause);
    return {
      enrollments: rows.map(serializeEnrollment),
      total: Number(totalRow?.count ?? 0),
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.post("/english-enrollments", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(englishEnrollmentCreateSchema, request.body);
    const [enrollment] = await db
      .insert(englishEnrollments)
      .values({
        studentId: body.student_id,
        classId: body.class_id,
        levelId: body.level_id,
        enrollDate: body.enroll_date,
        billingId: body.billing_id
      })
      .returning();

    if (!enrollment) {
      throw new Error("english_enrollment_create_failed");
    }

    return reply.code(201).send({ enrollment: serializeEnrollment(enrollment) });
  });

  app.delete("/english-enrollments/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(englishEnrollments).where(eq(englishEnrollments.id, id));
    return { ok: true };
  });

  app.post("/english-enrollments/:id/attendance", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(englishAttendanceMarkSchema, request.body);
    const [enrollment] = await db.select().from(englishEnrollments).where(eq(englishEnrollments.id, id)).limit(1);

    if (!enrollment) {
      return sendNotFound(reply);
    }

    const values = {
      enrollmentId: id,
      sessionDate: body.session_date,
      present: body.present
    };
    const [attendance] = await db
      .insert(englishAttendance)
      .values(values)
      .onConflictDoUpdate({
        target: [englishAttendance.enrollmentId, englishAttendance.sessionDate],
        set: { present: body.present }
      })
      .returning();

    if (!attendance) {
      throw new Error("english_attendance_upsert_failed");
    }

    return { attendance: serializeAttendance(attendance) };
  });

  app.get("/english-enrollments/:id/attendance", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [enrollment] = await db.select().from(englishEnrollments).where(eq(englishEnrollments.id, id)).limit(1);

    if (!enrollment) {
      return sendNotFound(reply);
    }

    const rows = await db
      .select()
      .from(englishAttendance)
      .where(eq(englishAttendance.enrollmentId, id))
      .orderBy(englishAttendance.sessionDate);

    return {
      attendance: rows.map(serializeAttendance),
      summary: {
        total_sessions: rows.length,
        attended_sessions: rows.filter((attendance) => attendance.present).length
      }
    };
  });

  app.post("/english-classes/:id/attendance", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(englishClassAttendanceSchema, request.body);
    const presentEnrollmentIds = new Set(body.present_enrollment_ids);
    const enrollments = await db.select().from(englishEnrollments).where(eq(englishEnrollments.classId, id));

    for (const enrollment of enrollments) {
      const present = presentEnrollmentIds.has(enrollment.id);
      await db
        .insert(englishAttendance)
        .values({
          enrollmentId: enrollment.id,
          sessionDate: body.session_date,
          present
        })
        .onConflictDoUpdate({
          target: [englishAttendance.enrollmentId, englishAttendance.sessionDate],
          set: { present }
        });
    }

    return { marked: enrollments.length };
  });
}
