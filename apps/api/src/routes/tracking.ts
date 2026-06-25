import { db, gpsTracks } from "@bh/db";
import { can, gpsPointsBatchSchema } from "@bh/shared";
import { and, asc, eq, gte, lte, type SQL, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema } from "./hrUtils";

const trackingQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

function numericValue(value: number | undefined): string | null {
  return value === undefined ? null : String(value);
}

export async function registerTrackingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.post("/tracking/points", { preHandler: requirePerm("attendance.self") }, async (request, reply) => {
    const body = parseWithSchema(gpsPointsBatchSchema, request.body);

    await db.insert(gpsTracks).values(
      body.points.map((point) => ({
        employeeId: request.user.id,
        recordedAt: new Date(point.recorded_at),
        lat: String(point.lat),
        lng: String(point.lng),
        accuracy: numericValue(point.accuracy),
        altitude: numericValue(point.altitude),
        speed: numericValue(point.speed),
        heading: numericValue(point.heading),
        batteryLevel: point.battery_level,
        isMoving: point.is_moving,
        trigger: point.trigger,
        deviceId: point.device_id,
        appState: point.app_state
      }))
    );

    return reply.code(201).send({ inserted: body.points.length });
  });

  app.get("/tracking/user/:id", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const query = parseWithSchema(trackingQuerySchema, request.query);

    if (id !== request.user.id && !can(request.user.role, "attendance.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const filters: SQL[] = [eq(gpsTracks.employeeId, id)];

    if (query.from) {
      filters.push(gte(gpsTracks.recordedAt, new Date(query.from)));
    }

    if (query.to) {
      filters.push(lte(gpsTracks.recordedAt, new Date(query.to)));
    }

    const tracks = await db
      .select()
      .from(gpsTracks)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(asc(gpsTracks.recordedAt));

    return { tracks };
  });
}
