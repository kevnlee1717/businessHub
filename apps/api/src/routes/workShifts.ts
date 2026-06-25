import { db, workShifts } from "@bh/db";
import { workShiftCreateSchema, workShiftUpdateSchema } from "@bh/shared";
import { eq, ne } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeWorkShift(shift: typeof workShifts.$inferSelect) {
  return {
    id: shift.id,
    name: shift.name,
    start_min: shift.startMin,
    end_min: shift.endMin,
    allowed_late_count: shift.allowedLateCount,
    is_default: shift.isDefault,
    created_at: shift.createdAt
  };
}

export async function registerWorkShiftRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/work-shifts", async () => {
    const rows = await db.select().from(workShifts).orderBy(workShifts.createdAt);
    return { work_shifts: rows.map(serializeWorkShift) };
  });

  app.get("/work-shifts/:id", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [shift] = await db.select().from(workShifts).where(eq(workShifts.id, id)).limit(1);

    if (!shift) {
      return sendNotFound(reply);
    }

    return { work_shift: serializeWorkShift(shift) };
  });

  app.post("/work-shifts", { preHandler: requirePerm("employee.manage") }, async (request, reply) => {
    const body = parseWithSchema(workShiftCreateSchema, request.body);
    const shift = await db.transaction(async (tx) => {
      if (body.is_default) {
        await tx.update(workShifts).set({ isDefault: false });
      }

      const [created] = await tx
        .insert(workShifts)
        .values({
          name: body.name,
          startMin: body.start_min,
          endMin: body.end_min,
          allowedLateCount: body.allowed_late_count,
          isDefault: body.is_default
        })
        .returning();

      return created;
    });

    if (!shift) {
      throw new Error("work_shift_create_failed");
    }

    return reply.code(201).send({ work_shift: serializeWorkShift(shift) });
  });

  app.patch("/work-shifts/:id", { preHandler: requirePerm("employee.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(workShiftUpdateSchema, request.body);
    const shift = await db.transaction(async (tx) => {
      if (body.is_default === true) {
        await tx.update(workShifts).set({ isDefault: false }).where(ne(workShifts.id, id));
      }

      const [updated] = await tx
        .update(workShifts)
        .set({
          name: body.name,
          startMin: body.start_min,
          endMin: body.end_min,
          allowedLateCount: body.allowed_late_count,
          isDefault: body.is_default
        })
        .where(eq(workShifts.id, id))
        .returning();

      return updated;
    });

    if (!shift) {
      return sendNotFound(reply);
    }

    return { work_shift: serializeWorkShift(shift) };
  });
}
