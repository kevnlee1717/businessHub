import { attendanceDays, attendanceRecords, db, employees } from "@bh/db";
import { attendanceClockSchema, can } from "@bh/shared";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";
import { z } from "zod";

const attendanceQuerySchema = z.object({
  employee_id: z.string().uuid().optional(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export async function registerAttendanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  // 员工给自己打卡(clock_in / clock_out)
  app.post("/attendance/clock", { preHandler: requirePerm("attendance.self") }, async (request, reply) => {
    const input = parseWithSchema(attendanceClockSchema, request.body);
    const employeeId = request.user.id;
    const clockedAt = input.clocked_at ? new Date(input.clocked_at) : new Date();
    const workDate = input.work_date ?? clockedAt.toISOString().slice(0, 10);

    // 同一员工同一天同一类型唯一 → 再次打卡更新时间
    const [record] = await db
      .insert(attendanceRecords)
      .values({
        employeeId,
        workDate,
        kind: input.kind,
        clockedAt,
        reason: input.reason,
        method: "manual"
      })
      .onConflictDoUpdate({
        target: [attendanceRecords.employeeId, attendanceRecords.workDate, attendanceRecords.kind],
        set: { clockedAt, reason: input.reason, method: "manual" }
      })
      .returning();

    if (!record) {
      return reply.code(500).send({ error: "clock_failed" });
    }

    // 维护当天汇总行,挂上 clockIn / clockOut
    const dayValues =
      input.kind === "clock_in"
        ? { clockInId: record.id, updatedAt: new Date() }
        : { clockOutId: record.id, updatedAt: new Date() };

    const [day] = await db
      .insert(attendanceDays)
      .values({ employeeId, workDate, ...dayValues })
      .onConflictDoUpdate({
        target: [attendanceDays.employeeId, attendanceDays.workDate],
        set: dayValues
      })
      .returning();

    return reply.code(201).send({ record, day });
  });

  // 查询打卡记录:本人随便查;查别人需 attendance.manage
  app.get("/attendance", async (request, reply) => {
    const query = parseWithSchema(attendanceQuerySchema, request.query);
    const filters: SQL[] = [];
    const canManage = can(request.user.role, "attendance.manage");

    if (query.employee_id && query.employee_id !== request.user.id && !canManage) {
      return reply.code(403).send({ error: "forbidden" });
    }

    if (query.employee_id) {
      filters.push(eq(attendanceRecords.employeeId, query.employee_id));
    } else if (!canManage) {
      filters.push(eq(attendanceRecords.employeeId, request.user.id));
    }

    if (query.work_date) {
      filters.push(eq(attendanceRecords.workDate, query.work_date));
    }

    const records = await db
      .select()
      .from(attendanceRecords)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(attendanceRecords.clockedAt));

    return { records };
  });

  // 某员工某天的汇总
  app.get("/employees/:id/attendance", async (request, reply) => {
    const params = parseWithSchema(idParamsSchema, request.params);

    if (params.id !== request.user.id && !can(request.user.role, "attendance.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const [employee] = await db.select().from(employees).where(eq(employees.id, params.id)).limit(1);

    if (!employee) {
      return sendNotFound(reply);
    }

    const days = await db
      .select()
      .from(attendanceDays)
      .where(eq(attendanceDays.employeeId, params.id))
      .orderBy(desc(attendanceDays.workDate));

    return { days };
  });
}
