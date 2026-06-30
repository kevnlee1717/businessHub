import { db, companies, companyExpenses, diplomaEnrollments, diplomaPayments, students } from "@bh/db";
import { and, asc, eq, ilike, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { parseWithSchema } from "./hrUtils";

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

const collectionQuerySchema = z
  .object({
    period: periodSchema.optional()
  })
  .merge(paginationQuery);

const overdueQuerySchema = z
  .object({
    as_of: periodSchema.optional()
  })
  .merge(paginationQuery);

const healthQuerySchema = z.object({
  period: periodSchema.optional()
});

function currentSgtPeriod() {
  const date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function money(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "0.00";
}

function moneyNumber(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function monthDiff(fromPeriod: string, toPeriod: string) {
  const [fromYearText, fromMonthText] = fromPeriod.split("-");
  const [toYearText, toMonthText] = toPeriod.split("-");
  return (Number(toYearText) - Number(fromYearText)) * 12 + (Number(toMonthText) - Number(fromMonthText));
}

export async function registerAcademyFinanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/academy/collection", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(collectionQuerySchema, request.query);
    const period = query.period ?? currentSgtPeriod();
    const pagination = getPagination(query);

    const rows = await db
      .select({
        paymentId: diplomaPayments.id,
        enrollmentId: diplomaEnrollments.id,
        studentId: students.id,
        studentName: students.name,
        program: diplomaEnrollments.program,
        amount: diplomaPayments.amount,
        paid: diplomaPayments.paid,
        paidAt: diplomaPayments.paidAt,
        period: diplomaPayments.period
      })
      .from(diplomaPayments)
      .innerJoin(diplomaEnrollments, eq(diplomaPayments.enrollmentId, diplomaEnrollments.id))
      .innerJoin(students, eq(diplomaEnrollments.studentId, students.id))
      .where(eq(diplomaPayments.period, period))
      .orderBy(asc(students.name), asc(diplomaEnrollments.createdAt));

    const expectedTotal = rows.reduce((sum, row) => sum + moneyNumber(row.amount), 0);
    const collectedTotal = rows.filter((row) => row.paid).reduce((sum, row) => sum + moneyNumber(row.amount), 0);
    const paidCount = rows.filter((row) => row.paid).length;
    const serializedRows = rows.map((row) => ({
      payment_id: row.paymentId,
      enrollment_id: row.enrollmentId,
      student_id: row.studentId,
      student_name: row.studentName,
      program: row.program,
      amount: money(row.amount),
      paid: row.paid,
      paid_at: row.paidAt,
      period: row.period
    }));
    const pageRows = pagination.paginate
      ? serializedRows.slice(pagination.offset, pagination.offset + pagination.limit)
      : serializedRows;

    return {
      period,
      summary: {
        expected_total: money(expectedTotal),
        collected_total: money(collectedTotal),
        outstanding_total: money(expectedTotal - collectedTotal),
        collection_rate: expectedTotal > 0 ? collectedTotal / expectedTotal : 0,
        due_count: rows.length,
        paid_count: paidCount,
        unpaid_count: rows.length - paidCount
      },
      rows: pageRows,
      ...(pagination.paginate
        ? {
            total: serializedRows.length,
            page: pagination.page,
            page_size: pagination.pageSize
          }
        : {})
    };
  });

  app.get("/academy/overdue", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(overdueQuerySchema, request.query);
    const asOfPeriod = query.as_of ?? currentSgtPeriod();
    const pagination = getPagination(query);

    const rows = await db
      .select({
        paymentId: diplomaPayments.id,
        studentName: students.name,
        program: diplomaEnrollments.program,
        period: diplomaPayments.period,
        amount: diplomaPayments.amount,
        enrollDate: diplomaEnrollments.enrollDate,
        phone: students.phone,
        graduated: diplomaEnrollments.graduated
      })
      .from(diplomaPayments)
      .innerJoin(diplomaEnrollments, eq(diplomaPayments.enrollmentId, diplomaEnrollments.id))
      .innerJoin(students, eq(diplomaEnrollments.studentId, students.id))
      .where(and(eq(diplomaPayments.paid, false), lte(diplomaPayments.period, asOfPeriod)))
      .orderBy(asc(diplomaEnrollments.graduated), asc(diplomaPayments.period), asc(students.name));

    const serializedRows = rows
      .map((row) => ({
        payment_id: row.paymentId,
        student_name: row.studentName,
        program: row.program,
        period: row.period,
        amount: money(row.amount),
        overdue_months: monthDiff(row.period, asOfPeriod),
        enroll_date: row.enrollDate,
        phone: row.phone,
        graduated: row.graduated
      }))
      .sort((left, right) => right.overdue_months - left.overdue_months || Number(left.graduated) - Number(right.graduated))
      .map(({ graduated, ...row }) => row);
    const pageRows = pagination.paginate
      ? serializedRows.slice(pagination.offset, pagination.offset + pagination.limit)
      : serializedRows;

    return {
      as_of_period: asOfPeriod,
      total_outstanding: money(rows.reduce((sum, row) => sum + moneyNumber(row.amount), 0)),
      rows: pageRows,
      ...(pagination.paginate
        ? {
            total: serializedRows.length,
            page: pagination.page,
            page_size: pagination.pageSize
          }
        : {})
    };
  });

  app.get("/academy/health", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(healthQuerySchema, request.query);
    const period = query.period ?? currentSgtPeriod();

    const [activeStudentsRow] = await db
      .select({ count: sql<number>`count(distinct ${diplomaEnrollments.studentId})::int` })
      .from(diplomaEnrollments)
      .where(eq(diplomaEnrollments.graduated, false));
    const activeStudents = activeStudentsRow?.count ?? 0;

    const [fixedCostRow] = await db
      .select({ total: sql<string>`coalesce(sum(${companyExpenses.amount}), 0)::text` })
      .from(companyExpenses)
      .innerJoin(companies, eq(companyExpenses.companyId, companies.id))
      .where(and(ilike(companies.name, "%恺德%"), eq(companyExpenses.period, period)));
    const monthlyFixedCost = moneyNumber(fixedCostRow?.total);

    const tuitionRows = await db
      .select({
        amount: diplomaPayments.amount,
        paid: diplomaPayments.paid
      })
      .from(diplomaPayments)
      .innerJoin(diplomaEnrollments, eq(diplomaPayments.enrollmentId, diplomaEnrollments.id))
      .where(eq(diplomaPayments.period, period));
    const expectedTuition = tuitionRows.reduce((sum, row) => sum + moneyNumber(row.amount), 0);
    const collectedTuition = tuitionRows.filter((row) => row.paid).reduce((sum, row) => sum + moneyNumber(row.amount), 0);

    const [periodActiveStudentRow] = await db
      .select({ count: sql<number>`count(distinct ${diplomaEnrollments.studentId})::int` })
      .from(diplomaPayments)
      .innerJoin(diplomaEnrollments, eq(diplomaPayments.enrollmentId, diplomaEnrollments.id))
      .where(and(eq(diplomaPayments.period, period), eq(diplomaEnrollments.graduated, false)));
    const periodActiveStudents = periodActiveStudentRow?.count ?? 0;

    const [fallbackAverageRow] = await db
      .select({ average: sql<string>`avg(${diplomaPayments.amount})::text` })
      .from(diplomaPayments)
      .innerJoin(diplomaEnrollments, eq(diplomaPayments.enrollmentId, diplomaEnrollments.id))
      .where(eq(diplomaEnrollments.graduated, false));

    const directAverage = periodActiveStudents > 0 ? expectedTuition / periodActiveStudents : 0;
    const fallbackAverage = moneyNumber(fallbackAverageRow?.average);
    const averageMonthlyTuition = directAverage > 0 ? directAverage : fallbackAverage;
    const breakevenStudents = averageMonthlyTuition > 0 ? Math.ceil(monthlyFixedCost / averageMonthlyTuition) : null;
    const gap = breakevenStudents === null ? null : Math.max(0, breakevenStudents - activeStudents);
    const reason = averageMonthlyTuition > 0 ? undefined : "no_current_or_active_enrollment_tuition";

    return {
      period,
      active_students: activeStudents,
      monthly_fixed_cost: money(monthlyFixedCost),
      expected_tuition: money(expectedTuition),
      collected_tuition: money(collectedTuition),
      avg_monthly_tuition_per_student: averageMonthlyTuition > 0 ? money(averageMonthlyTuition) : null,
      breakeven_students: breakevenStudents,
      gap,
      reason
    };
  });
}
