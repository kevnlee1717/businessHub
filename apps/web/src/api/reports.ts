import { api, ApiError, UnauthorizedError } from "./client";

export type ReportCompany = {
  id: string | null;
  name: string;
};

export type ReportPeriod = {
  from: string;
  to: string;
};

export type MoneyLine = {
  amount: string;
};

export type PnlRevenueLine = MoneyLine & {
  business_id: string | null;
  business_name: string;
};

export type PnlExpenseLine = MoneyLine & {
  category: string;
};

export type PnlSection<TLine extends MoneyLine> = {
  lines: TLine[];
  total: string;
};

export type PnlReport = {
  company: ReportCompany;
  period: ReportPeriod;
  basis: "cash";
  revenue: PnlSection<PnlRevenueLine>;
  cost_of_sales: PnlSection<PnlExpenseLine>;
  gross_profit: string;
  operating_expenses: PnlSection<PnlExpenseLine>;
  other_expenses: PnlSection<PnlExpenseLine>;
  net_profit_before_tax: string;
  by_company?: PnlReport[];
};

export type GstEstimate = {
  company: ReportCompany;
  period: ReportPeriod;
  basis: "cash";
  rate: number;
  revenue_total: string;
  taxable_expenses: string;
  output_tax_est: string;
  input_tax_est: string;
  net_gst_est: string;
  note: string;
};

export type ReportParams = {
  company_id?: string | null;
  from?: string;
  to?: string;
};

export type GstParams = ReportParams & {
  rate?: number;
};

function buildQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function filenameFromDisposition(disposition: string | null) {
  if (!disposition) {
    return null;
  }
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1].replace(/"/g, ""));
  }
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

export function getPnl(params: ReportParams): Promise<PnlReport> {
  return api<PnlReport>(`/reports/pnl${buildQuery(params)}`);
}

export function getGst(params: GstParams): Promise<GstEstimate> {
  return api<GstEstimate>(`/reports/gst${buildQuery(params)}`);
}

export async function downloadPnlCsv(params: ReportParams): Promise<void> {
  const response = await fetch(`/api/reports/pnl.csv${buildQuery(params)}`, {
    credentials: "include"
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    throw new ApiError(response.statusText, response.status);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ??
    `pnl_${params.from ?? "from"}_${params.to ?? "to"}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
