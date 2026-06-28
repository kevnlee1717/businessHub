import {
  businesses,
  companies,
  db,
  expenseCategories,
  ledgerEntries
} from "@bh/db";
import { and, asc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { endOfDate } from "./hrUtils";

type MoneyLine = {
  amount: string;
};

type RevenueLine = MoneyLine & {
  business_id: string | null;
  business_name: string;
};

type ExpenseLine = MoneyLine & {
  category: string;
};

type Section<TLine extends MoneyLine> = {
  lines: TLine[];
  total: string;
};

export type PnlReport = {
  company: {
    id: string | null;
    name: string;
  };
  period: {
    from: string;
    to: string;
  };
  basis: "cash";
  revenue: Section<RevenueLine>;
  cost_of_sales: Section<ExpenseLine>;
  gross_profit: string;
  operating_expenses: Section<ExpenseLine>;
  other_expenses: Section<ExpenseLine>;
  net_profit_before_tax: string;
};

export type GstEstimate = {
  company: {
    id: string | null;
    name: string;
  };
  period: {
    from: string;
    to: string;
  };
  basis: "cash";
  rate: number;
  revenue_total: string;
  taxable_expenses: string;
  output_tax_est: string;
  input_tax_est: string;
  net_gst_est: string;
  note: string;
};

type ReportSectionKey = "cost_of_sales" | "operating_expenses" | "other_expenses";

const SECTION_KEY_BY_REPORT_SECTION = {
  cost_of_sales: "cost_of_sales",
  operating_expense: "operating_expenses",
  other: "other_expenses"
} as const;

function money(value: number): string {
  return value.toFixed(2);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function csvCell(value: string | number | null): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(cells: (string | number | null)[]): string {
  return cells.map(csvCell).join(",");
}

function buildRevenueSection(map: Map<string, RevenueLine & { amountValue: number }>): Section<RevenueLine> {
  const rows = Array.from(map.values()).sort((left, right) => {
    return left.business_name.localeCompare(right.business_name, "zh-Hans");
  });
  const total = rows.reduce((sum, row) => sum + row.amountValue, 0);

  return {
    lines: rows.map((row) => ({
      business_id: row.business_id,
      business_name: row.business_name,
      amount: row.amount
    })),
    total: money(total)
  };
}

function buildExpenseSection(map: Map<string, ExpenseLine & { amountValue: number }>): Section<ExpenseLine> {
  const rows = Array.from(map.values()).sort((left, right) => {
    return left.category.localeCompare(right.category, "zh-Hans");
  });
  const total = rows.reduce((sum, row) => sum + row.amountValue, 0);

  return {
    lines: rows.map((row) => ({
      category: row.category,
      amount: row.amount
    })),
    total: money(total)
  };
}

async function resolveCompany(companyId: string | null) {
  if (!companyId) {
    return { id: null, name: "全部公司" };
  }

  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  return company ?? { id: companyId, name: "未知公司" };
}

export async function listReportCompanies(companyIds?: string[]) {
  const query = db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .$dynamic();

  if (companyIds) {
    if (companyIds.length === 0) {
      return [];
    }

    query.where(inArray(companies.id, companyIds));
  }

  return query.orderBy(asc(companies.name));
}

export async function buildPnl(
  companyId: string | null,
  from: string,
  to: string,
  companyIds?: string[]
): Promise<PnlReport> {
  const filters: SQL[] = [
    gte(ledgerEntries.occurredAt, new Date(from)),
    lte(ledgerEntries.occurredAt, endOfDate(to))
  ];

  if (companyId) {
    filters.push(eq(ledgerEntries.companyId, companyId));
  } else if (companyIds) {
    if (companyIds.length === 0) {
      filters.push(inArray(ledgerEntries.companyId, ["00000000-0000-0000-0000-000000000000"]));
    } else {
      filters.push(inArray(ledgerEntries.companyId, companyIds));
    }
  }

  const rows = await db
    .select({
      ledger: ledgerEntries,
      business: {
        id: businesses.id,
        name: businesses.name
      },
      category: {
        name: expenseCategories.name,
        reportSection: expenseCategories.reportSection
      }
    })
    .from(ledgerEntries)
    .leftJoin(businesses, eq(ledgerEntries.businessId, businesses.id))
    .leftJoin(expenseCategories, eq(ledgerEntries.expenseCategoryId, expenseCategories.id))
    .where(and(...filters));

  const revenue = new Map<string, RevenueLine & { amountValue: number }>();
  const expenses: Record<ReportSectionKey, Map<string, ExpenseLine & { amountValue: number }>> = {
    cost_of_sales: new Map(),
    operating_expenses: new Map(),
    other_expenses: new Map()
  };

  for (const row of rows) {
    const amount = Number(row.ledger.sgdEquivalent ?? 0);
    if (!Number.isFinite(amount)) {
      continue;
    }

    if (row.ledger.direction === "in") {
      const key = row.business?.id ?? "__uncategorized_revenue__";
      const current = revenue.get(key) ?? {
        business_id: row.business?.id ?? null,
        business_name: row.business?.name ?? "未分类收入",
        amount: "0.00",
        amountValue: 0
      };
      current.amountValue += amount;
      current.amount = money(current.amountValue);
      revenue.set(key, current);
      continue;
    }

    const sectionKey = row.category
      ? SECTION_KEY_BY_REPORT_SECTION[row.category.reportSection]
      : "other_expenses";
    const categoryName = row.category?.name ?? "未分类";
    const current = expenses[sectionKey].get(categoryName) ?? {
      category: categoryName,
      amount: "0.00",
      amountValue: 0
    };
    current.amountValue += amount;
    current.amount = money(current.amountValue);
    expenses[sectionKey].set(categoryName, current);
  }

  const revenueSection = buildRevenueSection(revenue);
  const costOfSales = buildExpenseSection(expenses.cost_of_sales);
  const operatingExpenses = buildExpenseSection(expenses.operating_expenses);
  const otherExpenses = buildExpenseSection(expenses.other_expenses);
  const revenueTotal = Number(revenueSection.total);
  const costOfSalesTotal = Number(costOfSales.total);
  const operatingTotal = Number(operatingExpenses.total);
  const otherTotal = Number(otherExpenses.total);
  const grossProfit = revenueTotal - costOfSalesTotal;

  return {
    company: await resolveCompany(companyId),
    period: { from, to },
    basis: "cash",
    revenue: revenueSection,
    cost_of_sales: costOfSales,
    gross_profit: money(grossProfit),
    operating_expenses: operatingExpenses,
    other_expenses: otherExpenses,
    net_profit_before_tax: money(grossProfit - operatingTotal - otherTotal)
  };
}

export async function buildGstEstimate(
  companyId: string | null,
  from: string,
  to: string,
  rate: number,
  companyIds?: string[]
): Promise<GstEstimate> {
  const pnl = await buildPnl(companyId, from, to, companyIds);
  const revenueTotal = Number(pnl.revenue.total);
  const taxableExpenses = Number(pnl.cost_of_sales.total) + Number(pnl.operating_expenses.total);
  const outputTax = roundMoney((revenueTotal * rate) / (1 + rate));
  const inputTax = roundMoney((taxableExpenses * rate) / (1 + rate));

  return {
    company: pnl.company,
    period: pnl.period,
    basis: pnl.basis,
    rate,
    revenue_total: money(revenueTotal),
    taxable_expenses: money(taxableExpenses),
    output_tax_est: money(outputTax),
    input_tax_est: money(inputTax),
    net_gst_est: money(outputTax - inputTax),
    note: "估算,未逐笔记录 GST"
  };
}

export function pnlToCsv(pnl: PnlReport): string {
  const rows: string[] = [
    csvRow(["公司", pnl.company.name]),
    csvRow(["期间", `${pnl.period.from} 至 ${pnl.period.to}`]),
    csvRow(["口径", "现金基础"]),
    "",
    csvRow(["收入", "金额(SGD)"]),
    ...pnl.revenue.lines.map((line) => csvRow([line.business_name, line.amount])),
    csvRow(["收入合计", pnl.revenue.total]),
    "",
    csvRow(["销货成本", "金额(SGD)"]),
    ...pnl.cost_of_sales.lines.map((line) => csvRow([line.category, line.amount])),
    csvRow(["销货成本合计", pnl.cost_of_sales.total]),
    csvRow(["毛利", pnl.gross_profit]),
    "",
    csvRow(["营业费用", "金额(SGD)"]),
    ...pnl.operating_expenses.lines.map((line) => csvRow([line.category, line.amount])),
    csvRow(["营业费用合计", pnl.operating_expenses.total]),
    "",
    csvRow(["其它", "金额(SGD)"]),
    ...pnl.other_expenses.lines.map((line) => csvRow([line.category, line.amount])),
    csvRow(["其它合计", pnl.other_expenses.total]),
    csvRow(["税前净利", pnl.net_profit_before_tax])
  ];

  return `\uFEFF${rows.join("\n")}\n`;
}
