import { db, tasks } from "@bh/db";
import { taskCreateSchema, taskRateSchema, taskStatuses, taskUpdateSchema } from "@bh/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { endOfDate, idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const taskQuerySchema = z.object({
  assignee_id: z.string().uuid().optional(),
  status: z.enum(taskStatuses).optional(),
  mine: z.enum(["true", "false"]).optional()
});

function taskValues(input: ReturnType<typeof taskCreateSchema.parse>) {
  return {
    title: input.title,
    description: input.description,
    assigneeId: input.assignee_id,
    dueDate: input.due_date,
    status: input.status,
    priority: input.priority,
    refType: input.ref_type,
    refId: input.ref_id,
    updatedAt: new Date()
  };
}

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/tasks", async (request) => {
    const query = parseWithSchema(taskQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.mine === "true") {
      filters.push(eq(tasks.assigneeId, request.user.id));
    } else if (query.assignee_id) {
      filters.push(eq(tasks.assigneeId, query.assignee_id));
    }

    if (query.status) {
      filters.push(eq(tasks.status, query.status));
    }

    const rows = await db
      .select()
      .from(tasks)
      .where(filters.length > 0 ? and(...filters) : sql`true`);

    return { tasks: rows };
  });

  app.get("/tasks/:id", async (request, reply) => {
    const params = parseWithSchema(idParamsSchema, request.params);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, params.id)).limit(1);

    if (!task) {
      return sendNotFound(reply);
    }

    return { task };
  });

  app.post("/tasks", async (request, reply) => {
    const input = parseWithSchema(taskCreateSchema, request.body);
    const [task] = await db
      .insert(tasks)
      .values({
        ...taskValues(input),
        creatorId: request.user.id
      })
      .returning();

    return reply.code(201).send({ task });
  });

  app.patch("/tasks/:id", { preHandler: requirePerm("task.manage") }, async (request, reply) => {
    const params = parseWithSchema(idParamsSchema, request.params);
    const input = parseWithSchema(taskUpdateSchema, request.body);
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, params.id)).limit(1);

    if (!existing) {
      return sendNotFound(reply);
    }

    const updates: Partial<typeof tasks.$inferInsert> = taskValues(
      input as ReturnType<typeof taskCreateSchema.parse>
    );

    if (input.status === "done" && existing.status !== "done") {
      const completedAt = new Date();
      const dueDate = input.due_date ?? existing.dueDate;
      updates.completedAt = completedAt;
      updates.onTime = dueDate ? completedAt <= endOfDate(dueDate) : true;
    }

    const [task] = await db.update(tasks).set(updates).where(eq(tasks.id, params.id)).returning();

    return { task };
  });

  app.post("/tasks/:id/rate", async (request, reply) => {
    const params = parseWithSchema(idParamsSchema, request.params);
    const input = parseWithSchema(taskRateSchema, request.body);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, params.id)).limit(1);

    if (!task) {
      return sendNotFound(reply);
    }

    if (task.status !== "done") {
      return reply.code(400).send({ error: "task_not_done" });
    }

    const canRate = task.creatorId === request.user.id || request.user.role === "owner" || request.user.role === "admin";

    if (!canRate) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const [updated] = await db
      .update(tasks)
      .set({
        satisfactionRating: input.satisfaction_rating,
        ratedBy: request.user.id,
        ratedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(tasks.id, params.id))
      .returning();

    return { task: updated };
  });
}
