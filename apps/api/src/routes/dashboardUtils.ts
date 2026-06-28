import {
  bankAccounts,
  billing,
  businesses,
  companies,
  db,
  dealLineAmounts,
  diplomaEnrollments,
  diplomaPayments,
  employees,
  ledgerEntries,
  payslips,
  recurringCosts,
  schemeVersions,
  students
} from "@bh/db";
import { type DealInputs } from "@bh/shared";
import { and, asc, desc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { calculateVersionEconomics } from "./financeUtils";

const SGT_OFFSET_HOURS = 8;

export type DashboardCompanyOverview = {
  company_id: string;
  name: string;
  cash: string;
  expected_income: string;
  collected_income: string;
  fixed_cost: string;
  projected_pl: string;
  health: "profit" | "breakeven" | "loss";
  tense: boolean;
  upcoming_payments_total: string;
  receivable_total: string;
  income_progress: number | null;
  behind: boolean;
};

export type DashboardOverview = {
  period: string;
  as_of_day: number;
  days_in_month: number;
  time_progress: number;
  global: {
    cash: string;
    expected_income: string;
    collected_income: string;
    fixed_cost: string;
    projected_pl: string;
    receivable_total: string;
  };
  companies: DashboardCompanyOverview[];
};

export type PaymentCalendarRow = {
  date: string;
  type: "recurring" | "payroll";
  label: string;
  amount: string;
  currency: "SGD" | "RMB";
  company_id: string;
};

export type ReceivableRow = {
  source: "academy" | "billing";
  student_or_client: string;
  period_or_ref: string;
  amount: string;
  overdue_months?: number;
};

export type KpiRow = {
  scope: "company" | "business";
  id: string;
  name: string;
  fixed_cost_share: string;
  per_unit_profit?: string | null;
  breakeven_units?: number | null;
  current_units?: number;
  gap_units?: number | null;
  breakeven_students?: number | null;
  gap_students?: number | null;
  note: string;
};

type CompanyRow = typeof companies.$inferSelect;
type BusinessRow = typeof businesses.$inferSelect;

export function money(value: string | number | null | undefined): string {
  return moneyNumber(value).toFixed(2);
}

export function moneyNumber(value: string | number | null | undefined): number {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function currentSgtPeriod(now = new Date()): string {
  const sgt = new Date(now.getTime() + SGT_OFFSET_HOURS * 60 * 60 * 1000);
  return `${sgt.getUTCFullYear()}-${String(sgt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getPeriodContext(period = currentSgtPeriod(), now = new Date()) {
  const [year, month] = parsePeriod(period);
  const start = sgtDateToUtc(year, month, 1);
  const end = month === 12 ? sgtDateToUtc(year + 1, 1, 1) : sgtDateToUtc(year, month + 1, 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const sgtNow = new Date(now.getTime() + SGT_OFFSET_HOURS * 60 * 60 * 1000);
  const isCurrentMonth = sgtNow.getUTCFullYear() === year && sgtNow.getUTCMonth() + 1 === month;
  const asOfDay = isCurrentMonth ? sgtNow.getUTCDate() : daysInMonth;

  return {
    period,
    year,
    month,
    start,
    end,
    daysInMonth,
    asOfDay,
    today: formatSgtDate(year, month, asOfDay),
    timeProgress: asOfDay / daysInMonth
  };
}

export function monthDiff(fromPeriod: string, toPeriod: string): number {
  const [fromYear, fromMonth] = parsePeriod(fromPeriod);
  const [toYear, toMonth] = parsePeriod(toPeriod);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export async function buildDashboardOverview(
  periodInput?: string,
  companyIds?: string[]
): Promise<DashboardOverview> {
  const ctx = getPeriodContext(periodInput);
  const companyRows = companyIds
    ? companyIds.length === 0
      ? []
      : await db.select().from(companies).where(inArray(companies.id, companyIds)).orderBy(asc(companies.name))
    : await db.select().from(companies).orderBy(asc(companies.name));
  const academyCompanyId = resolveAcademyCompanyId(companyRows);
  const paymentCalendar = await buildPaymentCalendar(ctx.period, undefined, companyIds);
  const remainingByCompany = sumRowsByCompany(paymentCalendar.rows.filter((row) => row.date >= ctx.today));
  const receivables = await buildReceivables(undefined, ctx.period, companyIds);
  const receivableByCompany = new Map<string, number>();

  if (academyCompanyId) {
    receivableByCompany.set(academyCompanyId, moneyNumber(receivables.total));
  }

  const summaries = await Promise.all(
    companyRows.map(async (company) => {
      const cash = await calculateCompanyCash(company.id);
      const fixedCost = await calculateCompanyFixedCost(company.id, ctx.period);
      const collectedIncome = await calculateCollectedIncome(company.id, ctx.start, ctx.end);
      const academyReceivable = academyCompanyId === company.id ? await calculateAcademyReceivableForPeriod(ctx.period) : 0;
      const expectedIncome = collectedIncome + academyReceivable;
      const ledgerOut = await calculateLedgerOut(company.id, ctx.start, ctx.end);
      // Without a reliable fixed-vs-variable marker on ledger out, use the larger of planned fixed cost
      // and actual cash outflow. This keeps recurring planned costs and paid ledger out from being double-counted.
      const projectedPl = expectedIncome - Math.max(fixedCost, ledgerOut);
      const receivableTotal = receivableByCompany.get(company.id) ?? 0;
      const incomeProgress = expectedIncome > 0 ? collectedIncome / expectedIncome : null;

      return {
        company_id: company.id,
        name: company.name,
        cash: money(cash),
        expected_income: money(expectedIncome),
        collected_income: money(collectedIncome),
        fixed_cost: money(fixedCost),
        projected_pl: money(projectedPl),
        health: healthFor(projectedPl, expectedIncome),
        tense: cash < (remainingByCompany.get(company.id) ?? 0),
        upcoming_payments_total: money(remainingByCompany.get(company.id) ?? 0),
        receivable_total: money(receivableTotal),
        income_progress: incomeProgress,
        behind: incomeProgress !== null && incomeProgress < ctx.timeProgress
      };
    })
  );

  return {
    period: ctx.period,
    as_of_day: ctx.asOfDay,
    days_in_month: ctx.daysInMonth,
    time_progress: ctx.timeProgress,
    global: {
      cash: money(sumField(summaries, "cash")),
      expected_income: money(sumField(summaries, "expected_income")),
      collected_income: money(sumField(summaries, "collected_income")),
      fixed_cost: money(sumField(summaries, "fixed_cost")),
      projected_pl: money(sumField(summaries, "projected_pl")),
      receivable_total: money(sumField(summaries, "receivable_total"))
    },
    companies: summaries
  };
}

export async function buildPaymentCalendar(periodInput?: string, companyId?: string, companyIds?: string[]) {
  const ctx = getPeriodContext(periodInput);
  const filters = [eq(recurringCosts.active, true)];
  if (companyId) filters.push(eq(recurringCosts.companyId, companyId));
  if (!companyId && companyIds) {
    filters.push(
      inArray(
        recurringCosts.companyId,
        companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"]
      )
    );
  }

  const recurringRows = await db
    .select()
    .from(recurringCosts)
    .where(and(...filters))
    .orderBy(asc(recurringCosts.dueDay), asc(recurringCosts.label));

  const payrollFilters = [eq(payslips.period, ctx.period), ne(payslips.status, "paid" as const)];
  if (companyId) payrollFilters.push(eq(employees.companyId, companyId));
  if (!companyId && companyIds) {
    payrollFilters.push(
      inArray(
        employees.companyId,
        companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"]
      )
    );
  }

  const payrollRows = await db
    .select({
      payslip: payslips,
      employeeName: employees.name,
      companyId: employees.companyId
    })
    .from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id))
    .where(and(...payrollFilters))
    .orderBy(asc(payslips.payday), asc(employees.name));

  const rows: PaymentCalendarRow[] = [
    ...recurringRows.map((row) => ({
      date: formatSgtDate(ctx.year, ctx.month, clampDay(row.dueDay, ctx.daysInMonth)),
      type: "recurring" as const,
      label: row.label,
      amount: money(row.amount),
      currency: row.currency,
      company_id: row.companyId
    })),
    ...payrollRows
      .filter((row) => row.companyId)
      .map((row) => {
        const payday = row.payslip.payday ?? ctx.daysInMonth;
        return {
          date: formatSgtDate(ctx.year, ctx.month, clampDay(payday, ctx.daysInMonth)),
          type: "payroll" as const,
          label: `${row.employeeName} payroll`,
          amount: money(moneyNumber(row.payslip.netPay) + moneyNumber(row.payslip.cpfEmployer)),
          currency: row.payslip.currency,
          company_id: row.companyId as string
        };
      })
  ].sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label));

  return {
    rows,
    total: money(rows.reduce((sum, row) => sum + moneyNumber(row.amount), 0)),
    remaining_from_today: money(rows.filter((row) => row.date >= ctx.today).reduce((sum, row) => sum + moneyNumber(row.amount), 0))
  };
}

export async function buildReceivables(companyId?: string, asOfPeriod = currentSgtPeriod(), companyIds?: string[]) {
  const companyRows = companyId
    ? await db.select().from(companies).where(eq(companies.id, companyId)).orderBy(asc(companies.name))
    : companyIds
      ? companyIds.length === 0
        ? []
        : await db.select().from(companies).where(inArray(companies.id, companyIds)).orderBy(asc(companies.name))
      : await db.select().from(companies).orderBy(asc(companies.name));
  const academyCompanyId = resolveAcademyCompanyId(companyRows);
  const includeAcademy = !companyId || companyId === academyCompanyId;
  const rows: ReceivableRow[] = [];

  if (includeAcademy) {
    const academyRows = await db
      .select({
        studentName: students.name,
        period: diplomaPayments.period,
        amount: diplomaPayments.amount
      })
      .from(diplomaPayments)
      .innerJoin(diplomaEnrollments, eq(diplomaPayments.enrollmentId, diplomaEnrollments.id))
      .innerJoin(students, eq(diplomaEnrollments.studentId, students.id))
      .where(and(eq(diplomaPayments.paid, false), lte(diplomaPayments.period, asOfPeriod)))
      .orderBy(asc(diplomaPayments.period), asc(students.name));

    rows.push(
      ...academyRows.map((row) => ({
        source: "academy" as const,
        student_or_client: row.studentName,
        period_or_ref: row.period,
        amount: money(row.amount),
        overdue_months: monthDiff(row.period, asOfPeriod)
      }))
    );
  }

  // TODO: Add billing receivable rows once production data clarifies client display names and partial-payment rules.
  return {
    total: money(rows.reduce((sum, row) => sum + moneyNumber(row.amount), 0)),
    rows
  };
}

export async function buildKpi(
  periodInput?: string,
  companyId?: string,
  accessibleCompanyIds?: string[]
): Promise<KpiRow[]> {
  const ctx = getPeriodContext(periodInput);
  const companyRows = companyId
    ? await db.select().from(companies).where(eq(companies.id, companyId)).orderBy(asc(companies.name))
    : accessibleCompanyIds
      ? accessibleCompanyIds.length === 0
        ? []
        : await db.select().from(companies).where(inArray(companies.id, accessibleCompanyIds)).orderBy(asc(companies.name))
      : await db.select().from(companies).orderBy(asc(companies.name));
  const fixedCosts = new Map<string, number>();
  const rows: KpiRow[] = [];

  for (const company of companyRows) {
    const fixedCost = await calculateCompanyFixedCost(company.id, ctx.period);
    fixedCosts.set(company.id, fixedCost);
    rows.push({
      scope: "company",
      id: company.id,
      name: company.name,
      fixed_cost_share: money(fixedCost),
      note: `本月需收入>=${money(fixedCost)} 保本`
    });
  }

  const companyIds = companyRows.map((company) => company.id);
  if (companyIds.length === 0) return rows;

  const businessRows = await db
    .select()
    .from(businesses)
    .where(and(inArray(businesses.companyId, companyIds), eq(businesses.status, "active" as const)))
    .orderBy(asc(businesses.companyId), asc(businesses.sortOrder), asc(businesses.name));
  const businessCountByCompany = countBusinessesByCompany(businessRows);

  for (const business of businessRows) {
    const fixedCostShare = (fixedCosts.get(business.companyId) ?? 0) / (businessCountByCompany.get(business.companyId) ?? 1);

    if (business.code === "diploma") {
      const academyHealth = await calculateAcademyHealth(ctx.period, fixedCostShare);
      rows.push({
        scope: "business",
        id: business.id,
        name: business.name,
        fixed_cost_share: money(fixedCostShare),
        breakeven_students: academyHealth.breakevenStudents,
        gap_students: academyHealth.gapStudents,
        note: academyHealth.reason ?? `学院按每生月均收入 ${academyHealth.averageMonthlyTuition ? money(academyHealth.averageMonthlyTuition) : "0.00"} 反推`
      });
      continue;
    }

    const perUnitProfit = await resolveBusinessPerUnitProfit(business);
    const currentUnits = await countBusinessUnits(business.id, ctx.start, ctx.end);
    const breakevenUnits = perUnitProfit > 0 ? Math.ceil(fixedCostShare / perUnitProfit) : null;
    rows.push({
      scope: "business",
      id: business.id,
      name: business.name,
      fixed_cost_share: money(fixedCostShare),
      per_unit_profit: perUnitProfit > 0 ? money(perUnitProfit) : null,
      breakeven_units: breakevenUnits,
      current_units: currentUnits,
      gap_units: breakevenUnits === null ? null : Math.max(0, breakevenUnits - currentUnits),
      note: perUnitProfit > 0 ? `按每单利润 ${money(perUnitProfit)} 反推` : "缺少默认版本利润,无法反推单数"
    });
  }

  return rows;
}

export async function buildWhatIf(companyId: string, items: { business_id: string; count: number }[], periodInput?: string) {
  const ctx = getPeriodContext(periodInput);
  const companyBusinesses = await db.select().from(businesses).where(eq(businesses.companyId, companyId));
  const businessById = new Map(companyBusinesses.map((business) => [business.id, business]));
  let addedProfit = 0;

  for (const item of items) {
    const business = businessById.get(item.business_id);
    if (!business) continue;
    addedProfit += (await resolveBusinessPerUnitProfit(business)) * item.count;
  }

  const cashBefore = await calculateCompanyCash(companyId);
  const fixedCost = await calculateCompanyFixedCost(companyId, ctx.period);
  const collectedIncome = await calculateCollectedIncome(companyId, ctx.start, ctx.end);
  const companyRows = await db.select().from(companies).orderBy(asc(companies.name));
  const academyReceivable =
    resolveAcademyCompanyId(companyRows) === companyId ? await calculateAcademyReceivableForPeriod(ctx.period) : 0;
  const ledgerOut = await calculateLedgerOut(companyId, ctx.start, ctx.end);
  const projectedPlBefore = collectedIncome + academyReceivable - Math.max(fixedCost, ledgerOut);

  return {
    added_profit: money(addedProfit),
    cash_before: money(cashBefore),
    cash_after: money(cashBefore + addedProfit),
    projected_pl_before: money(projectedPlBefore),
    projected_pl_after: money(projectedPlBefore + addedProfit)
  };
}

async function calculateCompanyCash(companyId: string): Promise<number> {
  const accountRows = await db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId));
  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const ledgerRows = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.companyId, companyId))
    .orderBy(asc(ledgerEntries.occurredAt));
  let cash = accountRows.reduce((sum, account) => sum + moneyNumber(account.openingBalance), 0);

  for (const entry of ledgerRows) {
    const account = entry.bankAccountId ? accountById.get(entry.bankAccountId) : null;
    if (account?.openingDate && entry.occurredAt < new Date(`${account.openingDate}T00:00:00+08:00`)) {
      continue;
    }
    const amount = moneyNumber(entry.sgdEquivalent);
    cash += entry.direction === "in" ? amount : -amount;
  }

  return cash;
}

async function calculateCompanyFixedCost(companyId: string, period: string): Promise<number> {
  const [recurringRow] = await db
    .select({ total: sql<string>`coalesce(sum(${recurringCosts.amount}), 0)::text` })
    .from(recurringCosts)
    .where(and(eq(recurringCosts.companyId, companyId), eq(recurringCosts.active, true), eq(recurringCosts.currency, "SGD")));

  const [payrollRow] = await db
    .select({
      total: sql<string>`coalesce(sum(coalesce(${payslips.netPay}, 0) + coalesce(${payslips.cpfEmployer}, 0)), 0)::text`
    })
    .from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id))
    .where(and(eq(employees.companyId, companyId), eq(payslips.period, period), eq(payslips.currency, "SGD")));

  return moneyNumber(recurringRow?.total) + moneyNumber(payrollRow?.total);
}

async function calculateCollectedIncome(companyId: string, start: Date, end: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.sgdEquivalent}), 0)::text` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.companyId, companyId),
        eq(ledgerEntries.direction, "in" as const),
        gte(ledgerEntries.occurredAt, start),
        lt(ledgerEntries.occurredAt, end)
      )
    );

  return moneyNumber(row?.total);
}

async function calculateLedgerOut(companyId: string, start: Date, end: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.sgdEquivalent}), 0)::text` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.companyId, companyId),
        eq(ledgerEntries.direction, "out" as const),
        gte(ledgerEntries.occurredAt, start),
        lt(ledgerEntries.occurredAt, end)
      )
    );

  return moneyNumber(row?.total);
}

async function calculateAcademyReceivableForPeriod(period: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${diplomaPayments.amount}), 0)::text` })
    .from(diplomaPayments)
    .where(and(eq(diplomaPayments.paid, false), eq(diplomaPayments.period, period)));

  return moneyNumber(row?.total);
}

async function calculateAcademyHealth(period: string, fixedCostShare: number) {
  const [activeStudentsRow] = await db
    .select({ count: sql<number>`count(distinct ${diplomaEnrollments.studentId})::int` })
    .from(diplomaEnrollments)
    .where(eq(diplomaEnrollments.graduated, false));
  const activeStudents = activeStudentsRow?.count ?? 0;

  const tuitionRows = await db
    .select({ amount: diplomaPayments.amount })
    .from(diplomaPayments)
    .innerJoin(diplomaEnrollments, eq(diplomaPayments.enrollmentId, diplomaEnrollments.id))
    .where(eq(diplomaPayments.period, period));
  const expectedTuition = tuitionRows.reduce((sum, row) => sum + moneyNumber(row.amount), 0);

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
  const breakevenStudents = averageMonthlyTuition > 0 ? Math.ceil(fixedCostShare / averageMonthlyTuition) : null;

  return {
    activeStudents,
    averageMonthlyTuition,
    breakevenStudents,
    gapStudents: breakevenStudents === null ? null : Math.max(0, breakevenStudents - activeStudents),
    reason: averageMonthlyTuition > 0 ? undefined : "no_current_or_active_enrollment_tuition"
  };
}

async function resolveBusinessPerUnitProfit(business: BusinessRow): Promise<number> {
  if (!business.defaultVersionId) return 0;

  const [latestBilling] = await db
    .select({ id: billing.id })
    .from(billing)
    .where(and(eq(billing.businessId, business.id), eq(billing.schemeVersionId, business.defaultVersionId)))
    .orderBy(desc(billing.createdAt))
    .limit(1);

  if (latestBilling) {
    const lineRows = await db.select().from(dealLineAmounts).where(eq(dealLineAmounts.billingId, latestBilling.id));
    if (lineRows.length > 0) {
      return lineRows.reduce((sum, row) => {
        const amount = moneyNumber(row.amountTotalExpected ?? row.amountPerPeriod);
        return sum + (row.kind === "revenue" ? amount : -amount);
      }, 0);
    }
  }

  const [version] = await db.select().from(schemeVersions).where(eq(schemeVersions.id, business.defaultVersionId)).limit(1);
  if (!version) return 0;

  const economics = await calculateVersionEconomics(version.id, (version.assumedInputs ?? {}) as DealInputs);
  return moneyNumber(economics.totals.expected.profit);
}

async function countBusinessUnits(businessId: string, start: Date, end: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(billing)
    .where(and(eq(billing.businessId, businessId), gte(billing.createdAt, start), lt(billing.createdAt, end)));

  return row?.count ?? 0;
}

function parsePeriod(period: string): [number, number] {
  const [yearText, monthText] = period.split("-");
  return [Number(yearText), Number(monthText)];
}

function sgtDateToUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -SGT_OFFSET_HOURS, 0, 0, 0));
}

function formatSgtDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function clampDay(day: number, daysInMonth: number): number {
  return Math.max(1, Math.min(day, daysInMonth));
}

function resolveAcademyCompanyId(companyRows: CompanyRow[]): string | undefined {
  return companyRows.find((company) => company.name.includes("恺德") || company.nameEn?.toLowerCase().includes("kaide"))?.id;
}

function healthFor(projectedPl: number, expectedIncome: number): "profit" | "breakeven" | "loss" {
  if (projectedPl > 0) return "profit";
  if (Math.abs(projectedPl) <= expectedIncome * 0.05) return "breakeven";
  return "loss";
}

function sumField(rows: DashboardCompanyOverview[], field: keyof Pick<DashboardCompanyOverview, "cash" | "expected_income" | "collected_income" | "fixed_cost" | "projected_pl" | "receivable_total">) {
  return rows.reduce((sum, row) => sum + moneyNumber(row[field]), 0);
}

function sumRowsByCompany(rows: PaymentCalendarRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.company_id, (map.get(row.company_id) ?? 0) + moneyNumber(row.amount));
  }
  return map;
}

function countBusinessesByCompany(rows: BusinessRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.companyId, (map.get(row.companyId) ?? 0) + 1);
  }
  return map;
}
