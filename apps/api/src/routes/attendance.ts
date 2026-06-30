import {
  attendanceDays,
  attendanceRecords,
  clockPoints,
  companies,
  db,
  employeeClockPoints,
  employees,
  workShifts
} from "@bh/db";
import { attendanceClockSchema, type AttendanceDayStatus } from "@bh/shared";
import { and, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { ctxCan } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";
import { z } from "zod";

const attendanceQuerySchema = z
  .object({
    employee_id: z.string().uuid().optional(),
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
  .merge(paginationQuery);

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function minutesOfDaySgt(clockedAt: Date): number {
  const sgt = new Date(clockedAt.getTime() + 8 * 3600 * 1000);
  return sgt.getUTCHours() * 60 + sgt.getUTCMinutes();
}

async function resolveEmployeeShift(employeeId: string) {
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);

  if (employee?.shiftId) {
    const [shift] = await db.select().from(workShifts).where(eq(workShifts.id, employee.shiftId)).limit(1);
    if (shift) {
      return shift;
    }
  }

  if (employee?.companyId) {
    const [company] = await db.select().from(companies).where(eq(companies.id, employee.companyId)).limit(1);

    if (company?.shiftId) {
      const [shift] = await db.select().from(workShifts).where(eq(workShifts.id, company.shiftId)).limit(1);
      if (shift) {
        return shift;
      }
    }
  }

  const [defaultShift] = await db.select().from(workShifts).where(eq(workShifts.isDefault, true)).limit(1);
  return defaultShift ?? null;
}

function calculateDayStatus(params: {
  clockIn: typeof attendanceRecords.$inferSelect | null;
  clockOut: typeof attendanceRecords.$inferSelect | null;
}): AttendanceDayStatus {
  const { clockIn, clockOut } = params;

  if (!clockIn || !clockOut) {
    return "incomplete";
  }

  const late = (clockIn.deviationMinutes ?? 0) > 0;
  const early = (clockOut.deviationMinutes ?? 0) > 0;

  if (late && early) return "late_and_early";
  if (late) return "late";
  if (early) return "early_leave";
  return "present";
}

export async function registerAttendanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  // 员工给自己打卡(clock_in / clock_out),管理员可代录
  app.post("/attendance/clock", { preHandler: requirePerm("attendance.self") }, async (request, reply) => {
    const input = parseWithSchema(attendanceClockSchema, request.body);
    const targetId = input.employee_id ?? request.user.id;

    if (targetId !== request.user.id && !(await ctxCan(request, "attendance.manage"))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const employeeId = targetId;
    const onBehalfUserId = targetId === request.user.id ? null : request.user.id;
    const clockedAt = input.clocked_at ? new Date(input.clocked_at) : new Date();
    const workDate = input.work_date ?? clockedAt.toISOString().slice(0, 10);
    const shift = await resolveEmployeeShift(employeeId);
    const minutesOfDay = minutesOfDaySgt(clockedAt);
    const deviationMinutes = shift
      ? input.kind === "clock_in"
        ? Math.max(0, minutesOfDay - shift.startMin)
        : Math.max(0, shift.endMin - minutesOfDay)
      : null;

    let clockPointId: string | null = null;
    let distanceM: string | null = null;
    let inGeofence: boolean | null = null;
    const inputLat = input.lat;
    const inputLng = input.lng;
    const hasLocation = inputLat !== undefined && inputLng !== undefined;
    const lat = hasLocation ? String(inputLat) : null;
    const lng = hasLocation ? String(inputLng) : null;
    const method = hasLocation && !onBehalfUserId ? "gps" : "manual";

    if (hasLocation) {
      const assignedClockPoints = await db
        .select({ clockPoint: clockPoints })
        .from(employeeClockPoints)
        .innerJoin(clockPoints, eq(employeeClockPoints.clockPointId, clockPoints.id))
        .where(and(eq(employeeClockPoints.employeeId, employeeId), eq(clockPoints.active, true)));

      let nearest:
        | {
            clockPoint: typeof clockPoints.$inferSelect;
            distance: number;
          }
        | null = null;

      for (const row of assignedClockPoints) {
        const distance = haversineMeters(inputLat, inputLng, Number(row.clockPoint.lat), Number(row.clockPoint.lng));
        if (!nearest || distance < nearest.distance) {
          nearest = { clockPoint: row.clockPoint, distance };
        }
      }

      if (nearest) {
        clockPointId = nearest.clockPoint.id;
        distanceM = nearest.distance.toFixed(2);
        inGeofence = nearest.distance <= nearest.clockPoint.radiusM;
      }
    }

    // 同一员工同一天同一类型唯一 → 再次打卡更新时间
    const [record] = await db
      .insert(attendanceRecords)
      .values({
        employeeId,
        workDate,
        kind: input.kind,
        clockedAt,
        reason: input.reason,
        method,
        deviationMinutes,
        clockPointId,
        lat,
        lng,
        distanceM,
        inGeofence,
        onBehalfUserId
      })
      .onConflictDoUpdate({
        target: [attendanceRecords.employeeId, attendanceRecords.workDate, attendanceRecords.kind],
        set: {
          clockedAt,
          reason: input.reason,
          method,
          deviationMinutes,
          clockPointId,
          lat,
          lng,
          distanceM,
          inGeofence,
          onBehalfUserId
        }
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

    let [day] = await db
      .insert(attendanceDays)
      .values({ employeeId, workDate, ...dayValues })
      .onConflictDoUpdate({
        target: [attendanceDays.employeeId, attendanceDays.workDate],
        set: dayValues
      })
      .returning();

    if (shift && day) {
      const [clockIn] = day.clockInId
        ? await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, day.clockInId)).limit(1)
        : [];
      const [clockOut] = day.clockOutId
        ? await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, day.clockOutId)).limit(1)
        : [];
      const status = calculateDayStatus({ clockIn: clockIn ?? null, clockOut: clockOut ?? null });
      const [updatedDay] = await db
        .update(attendanceDays)
        .set({ status, updatedAt: new Date() })
        .where(eq(attendanceDays.id, day.id))
        .returning();

      day = updatedDay ?? day;
    }

    return reply.code(201).send({ record, day });
  });

  // 查询打卡记录:本人随便查;查别人需 attendance.manage
  app.get("/attendance", async (request, reply) => {
    const query = parseWithSchema(attendanceQuerySchema, request.query);
    const filters: SQL[] = [];
    const canManage = await ctxCan(request, "attendance.manage");

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

    const where = filters.length > 0 ? and(...filters) : sql`true`;
    const pagination = getPagination(query);
    const records = pagination.paginate
      ? await db
          .select()
          .from(attendanceRecords)
          .where(where)
          .orderBy(desc(attendanceRecords.clockedAt))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db
          .select()
          .from(attendanceRecords)
          .where(where)
          .orderBy(desc(attendanceRecords.clockedAt));

    if (!pagination.paginate) {
      return { records };
    }

    const [totalRow] = await db.select({ total: count() }).from(attendanceRecords).where(where);

    return {
      records,
      total: totalRow?.total ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  // 某员工某天的汇总
  app.get("/employees/:id/attendance", async (request, reply) => {
    const params = parseWithSchema(idParamsSchema, request.params);

    if (params.id !== request.user.id && !(await ctxCan(request, "attendance.manage"))) {
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
