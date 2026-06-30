import { clockPoints, db, employeeClockPoints } from "@bh/db";
import { clockPointCreateSchema, clockPointUpdateSchema, employeeClockPointsAssignSchema } from "@bh/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { ctxCan } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const clockPointQuerySchema = z.object({}).merge(paginationQuery);

function serializeClockPoint(clockPoint: typeof clockPoints.$inferSelect) {
  return {
    id: clockPoint.id,
    name: clockPoint.name,
    name_en: clockPoint.nameEn,
    lat: clockPoint.lat,
    lng: clockPoint.lng,
    radius_m: clockPoint.radiusM,
    company_id: clockPoint.companyId,
    active: clockPoint.active,
    created_at: clockPoint.createdAt
  };
}

async function listEmployeeClockPoints(employeeId: string) {
  const rows = await db
    .select({ clockPoint: clockPoints })
    .from(employeeClockPoints)
    .innerJoin(clockPoints, eq(employeeClockPoints.clockPointId, clockPoints.id))
    .where(eq(employeeClockPoints.employeeId, employeeId))
    .orderBy(desc(clockPoints.active), clockPoints.createdAt);

  return rows.map((row) => serializeClockPoint(row.clockPoint));
}

export async function registerClockPointRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/clock-points", async (request) => {
    const query = parseWithSchema(clockPointQuerySchema, request.query);
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select()
          .from(clockPoints)
          .orderBy(desc(clockPoints.active), clockPoints.createdAt)
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(clockPoints).orderBy(desc(clockPoints.active), clockPoints.createdAt);

    if (!pagination.paginate) {
      return { clockPoints: rows.map(serializeClockPoint) };
    }

    const [totalRow] = await db.select({ total: count() }).from(clockPoints);

    return {
      clockPoints: rows.map(serializeClockPoint),
      total: totalRow?.total ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.post("/clock-points", { preHandler: requirePerm("attendance.manage") }, async (request, reply) => {
    const body = parseWithSchema(clockPointCreateSchema, request.body);
    const [clockPoint] = await db
      .insert(clockPoints)
      .values({
        name: body.name,
        nameEn: body.name_en,
        lat: String(body.lat),
        lng: String(body.lng),
        radiusM: body.radius_m,
        companyId: body.company_id,
        active: body.active
      })
      .returning();

    if (!clockPoint) {
      throw new Error("clock_point_create_failed");
    }

    return reply.code(201).send({ clockPoint: serializeClockPoint(clockPoint) });
  });

  app.put("/clock-points/:id", { preHandler: requirePerm("attendance.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(clockPointUpdateSchema, request.body);
    const [clockPoint] = await db
      .update(clockPoints)
      .set({
        name: body.name,
        nameEn: body.name_en,
        lat: body.lat === undefined ? undefined : String(body.lat),
        lng: body.lng === undefined ? undefined : String(body.lng),
        radiusM: body.radius_m,
        companyId: body.company_id,
        active: body.active
      })
      .where(eq(clockPoints.id, id))
      .returning();

    if (!clockPoint) {
      return sendNotFound(reply);
    }

    return { clockPoint: serializeClockPoint(clockPoint) };
  });

  app.delete("/clock-points/:id", { preHandler: requirePerm("attendance.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(clockPoints).where(eq(clockPoints.id, id));
    return { ok: true };
  });

  app.get("/employees/:id/clock-points", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);

    if (id !== request.user.id && !(await ctxCan(request, "attendance.manage"))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const rows = await listEmployeeClockPoints(id);
    return { clockPoints: rows };
  });

  app.put("/employees/:id/clock-points", { preHandler: requirePerm("attendance.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(employeeClockPointsAssignSchema, request.body);
    const clockPointIds = [...new Set(body.clock_point_ids)];

    await db.transaction(async (tx) => {
      await tx.delete(employeeClockPoints).where(eq(employeeClockPoints.employeeId, id));

      if (clockPointIds.length > 0) {
        await tx.insert(employeeClockPoints).values(
          clockPointIds.map((clockPointId) => ({
            employeeId: id,
            clockPointId
          }))
        );
      }
    });

    const rows = await db
      .select({ clockPoint: clockPoints })
      .from(employeeClockPoints)
      .innerJoin(clockPoints, eq(employeeClockPoints.clockPointId, clockPoints.id))
      .where(and(eq(employeeClockPoints.employeeId, id)))
      .orderBy(desc(clockPoints.active), clockPoints.createdAt);

    return { clockPoints: rows.map((row) => serializeClockPoint(row.clockPoint)) };
  });
}
