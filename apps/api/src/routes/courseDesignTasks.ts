import { db, courseDesignTasks } from "@bh/db";
import { courseDesignTaskCreateSchema, courseDesignTaskUpdateSchema } from "@bh/shared";
import { asc, count, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeTask(task: typeof courseDesignTasks.$inferSelect) {
  return {
    id: task.id,
    title: task.title,
    owner: task.owner,
    status: task.status,
    deliverable: task.deliverable,
    sort_order: task.sortOrder,
    created_at: task.createdAt,
    updated_at: task.updatedAt
  };
}

export async function registerCourseDesignTaskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/course-design-tasks", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(paginationQuery, request.query);
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select()
          .from(courseDesignTasks)
          .orderBy(asc(courseDesignTasks.sortOrder), asc(courseDesignTasks.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db
          .select()
          .from(courseDesignTasks)
          .orderBy(asc(courseDesignTasks.sortOrder), asc(courseDesignTasks.createdAt));

    if (!pagination.paginate) {
      return { tasks: rows.map(serializeTask) };
    }

    const [totalRow] = await db.select({ count: count() }).from(courseDesignTasks);
    return {
      tasks: rows.map(serializeTask),
      total: Number(totalRow?.count ?? 0),
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.post("/course-design-tasks", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(courseDesignTaskCreateSchema, request.body);
    const [task] = await db
      .insert(courseDesignTasks)
      .values({
        title: body.title,
        owner: body.owner,
        status: body.status,
        deliverable: body.deliverable,
        sortOrder: body.sort_order
      })
      .returning();

    if (!task) {
      throw new Error("course_design_task_create_failed");
    }

    return reply.code(201).send({ task: serializeTask(task) });
  });

  app.patch("/course-design-tasks/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(courseDesignTaskUpdateSchema, request.body);
    const update: Partial<typeof courseDesignTasks.$inferInsert> = {
      updatedAt: new Date()
    };

    if (body.title !== undefined) update.title = body.title;
    if (body.owner !== undefined) update.owner = body.owner;
    if (body.status !== undefined) update.status = body.status;
    if (body.deliverable !== undefined) update.deliverable = body.deliverable;
    if (body.sort_order !== undefined) update.sortOrder = body.sort_order;

    const [task] = await db.update(courseDesignTasks).set(update).where(eq(courseDesignTasks.id, id)).returning();

    if (!task) {
      return sendNotFound(reply);
    }

    return { task: serializeTask(task) };
  });

  app.delete("/course-design-tasks/:id", { preHandler: requirePerm("education.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(courseDesignTasks).where(eq(courseDesignTasks.id, id));
    return { ok: true };
  });
}
