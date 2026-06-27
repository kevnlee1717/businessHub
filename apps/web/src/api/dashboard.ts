import {
  type Currency,
  type RecurringCostCreateInput,
  type RecurringCostUpdateInput
} from "@bh/shared";
import { api } from "./client";

function queryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) {
      searchParams.set(key, trimmed);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export type DashboardHealth = "profit" | "breakeven" | "loss";

export type DashboardCompany = {
  company_id: string;
  name: string;
  cash: number | string;
  expected_income: number | string;
  collected_income: number | string;
  fixed_cost: number | string;
  projected_pl: number | string;
  health: DashboardHealth;
  tense: boolean;
  upcoming_payments_total: number | string;
  receivable_total: number | string;
  income_progress: number | string | null;
  behind: boolean;
};

export type DashboardOverview = {
  period: string;
  as_of_day: number;
  days_in_month: number;
  time_progress: number | string;
  global: {
    cash: number | string;
    expected_income: number | string;
    collected_income: number | string;
    fixed_cost: number | string;
    projected_pl: number | string;
    receivable_total: number | string;
  };
  companies: DashboardCompany[];
};

export type PaymentCalendarRow = {
  date: string;
  type: "recurring" | "payroll";
  label: string;
  amount: number | string;
  currency: Currency;
  company_id?: string | null;
};

export type PaymentCalendar = {
  rows: PaymentCalendarRow[];
  total: number | string;
  remaining_from_today: number | string;
};

export type ReceivableRow = {
  source: string;
  student_or_client: string;
  period_or_ref: string;
  amount: number | string;
  overdue_months?: number | null;
};

export type Receivables = {
  total: number | string;
  rows: ReceivableRow[];
};

export type DashboardKpiRow = {
  scope: "company" | "business";
  id: string;
  name: string;
  fixed_cost_share: number | string;
  per_unit_profit?: number | string | null;
  breakeven_units?: number | null;
  current_units?: number | null;
  gap_units?: number | null;
  breakeven_students?: number | null;
  gap_students?: number | null;
  note?: string | null;
};

export type WhatIfInput = {
  company_id: string;
  items: { business_id: string; count: number }[];
};

export type WhatIfResult = {
  added_profit: number | string;
  cash_before: number | string;
  cash_after: number | string;
  projected_pl_before: number | string;
  projected_pl_after: number | string;
};

export type RecurringCost = {
  id: string;
  company_id: string;
  expense_category_id?: string | null;
  label: string;
  amount: number | string;
  currency: Currency;
  due_day: number;
  active: boolean;
  note?: string | null;
  created_at: string;
};

export function getDashboardOverview(period?: string | null): Promise<DashboardOverview> {
  return api<DashboardOverview>(`/dashboard/overview${queryString({ period })}`);
}

export function getPaymentCalendar(params: {
  company_id?: string | null;
  period?: string | null;
} = {}): Promise<PaymentCalendar> {
  return api<PaymentCalendar>(`/dashboard/payment-calendar${queryString(params)}`);
}

export function getReceivables(params: { company_id?: string | null } = {}): Promise<Receivables> {
  return api<Receivables>(`/dashboard/receivables${queryString(params)}`);
}

export function getDashboardKpi(params: {
  company_id?: string | null;
  period?: string | null;
} = {}): Promise<DashboardKpiRow[]> {
  return api<DashboardKpiRow[]>(`/dashboard/kpi${queryString(params)}`);
}

export function runWhatIf(body: WhatIfInput): Promise<WhatIfResult> {
  return api<WhatIfResult>("/dashboard/whatif", { method: "POST", body });
}

export function listRecurringCosts(params: { company_id?: string | null } = {}): Promise<{ recurring_costs: RecurringCost[] }> {
  return api<{ recurring_costs: RecurringCost[] }>(`/recurring-costs${queryString(params)}`);
}

export function createRecurringCost(body: RecurringCostCreateInput): Promise<{ recurring_cost: RecurringCost }> {
  return api<{ recurring_cost: RecurringCost }>("/recurring-costs", { method: "POST", body });
}

export function updateRecurringCost(
  id: string,
  body: RecurringCostUpdateInput
): Promise<{ recurring_cost: RecurringCost }> {
  return api<{ recurring_cost: RecurringCost }>(`/recurring-costs/${id}`, { method: "PATCH", body });
}

export function deleteRecurringCost(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/recurring-costs/${id}`, { method: "DELETE" });
}
