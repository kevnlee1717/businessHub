import { db, diplomaCourses, diplomaIntakes } from "@bh/db";
import {
  diplomaCourseCreateSchema,
  diplomaCourseUpdateSchema,
  diplomaIntakeCreateSchema,
  diplomaIntakeUpdateSchema
} from "@bh/shared";
import { and, asc, count, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

function serializeDiplomaCourse(course: typeof diplomaCourses.$inferSelect) {
  return {
    id: course.id,
    name: course.name,
    name_en: course.nameEn,
    active: course.active,
    sort_order: course.sortOrder,
    months: course.months,
    price_sgd: course.priceSgd,
    created_at: course.createdAt
  };
}

function serializeDiplomaIntake(intake: typeof diplomaIntakes.$inferSelect) {
  return {
    id: intake.id,
    course_id: intake.courseId,
    module_id: intake.moduleId,
    label: intake.label,
    start_date: intake.startDate,
    active: intake.active,
    sort_order: intake.sortOrder,
    created_at: intake.createdAt
  };
}

const courseIntakeParamsSchema = z.object({
  courseId: z.string().uuid(),
  id: z.string().uuid()
});

export async function registerDiplomaCourseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/diploma-courses", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(paginationQuery, request.query);
    const pagination = getPagination(query);
    const courses = pagination.paginate
      ? await db
          .select()
          .from(diplomaCourses)
          .orderBy(diplomaCourses.sortOrder, diplomaCourses.name)
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(diplomaCourses).orderBy(diplomaCourses.sortOrder, diplomaCourses.name);

    if (!pagination.paginate) {
      return { courses: courses.map(serializeDiplomaCourse) };
    }

    const [totalRow] = await db.select({ count: count() }).from(diplomaCourses);
    return {
      courses: courses.map(serializeDiplomaCourse),
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

    return { course: serializeDiplomaCourse(course) };
  });

  app.post("/diploma-courses", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(diplomaCourseCreateSchema, request.body);
    const [course] = await db
      .insert(diplomaCourses)
      .values({
        name: body.name,
        nameEn: body.name_en,
        active: body.active,
        sortOrder: body.sort_order,
        months: body.months,
        priceSgd: toNumeric(body.price_sgd)
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
        active: body.active,
        sortOrder: body.sort_order,
        months: body.months,
        priceSgd: toNumeric(body.price_sgd)
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
        moduleId: body.module_id,
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
        courseId: body.course_id,
        moduleId: body.module_id,
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
}
