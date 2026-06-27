import {
  type CommissionEntryCreateInput,
  type CommissionEntryStatus,
  type CommissionEntryUpdateInput,
  type CommissionRecurrence,
  type CommissionType,
  type SalesAssignmentCreateInput,
  type SalesAssignmentUpdateInput
} from "@bh/shared";
import { type Business } from "./businessSchemes";
import { api } from "./client";
import { type Employee } from "./hr";

export type SalesBusinessAssignment = {
  id: string;
  sales_id: string;
  business_id: string;
  commission_type?: CommissionType | null;
  commission_value?: string | null;
  active: boolean;
  note?: string | null;
  created_at: string;
  business?: Business | null;
  sales?: Employee | null;
};

export type CommissionEntry = {
  id: string;
  sales_id: string;
  billing_id: string;
  business_id?: string | null;
  period: string;
  recurrence: CommissionRecurrence;
  seq: number;
  amount_sgd: string;
  status: CommissionEntryStatus;
  payslip_id?: string | null;
  source_line_id?: string | null;
  note?: string | null;
  created_at: string;
  sales?: Pick<Employee, "id" | "name" | "name_en"> | null;
  business?: Pick<Business, "id" | "code" | "name" | "name_en"> | null;
};

export type CommissionEntryListParams = {
  sales_id?: string | null;
  period?: string | null;
  business_id?: string | null;
  status?: CommissionEntryStatus | null;
};

export type CommissionTotals = Partial<Record<CommissionEntryStatus, string>>;

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

export function listSalesAssignments(salesId: string): Promise<{ assignments: SalesBusinessAssignment[] }> {
  return api<{ assignments: SalesBusinessAssignment[] }>(`/sales/${salesId}/businesses`);
}

export function listBusinessSales(businessId: string): Promise<{ assignments: SalesBusinessAssignment[] }> {
  return api<{ assignments: SalesBusinessAssignment[] }>(`/businesses/${businessId}/sales`);
}

export function createSalesAssignment(
  body: SalesAssignmentCreateInput
): Promise<{ assignment: SalesBusinessAssignment }> {
  return api<{ assignment: SalesBusinessAssignment }>("/sales-business-assignments", {
    method: "POST",
    body
  });
}

export function updateSalesAssignment(
  id: string,
  body: SalesAssignmentUpdateInput
): Promise<{ assignment: SalesBusinessAssignment }> {
  return api<{ assignment: SalesBusinessAssignment }>(`/sales-business-assignments/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteSalesAssignment(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/sales-business-assignments/${id}`, {
    method: "DELETE"
  });
}

export function listCommissionEntries(
  params: CommissionEntryListParams = {}
): Promise<{ entries: CommissionEntry[]; totals: CommissionTotals }> {
  return api<{ entries: CommissionEntry[]; totals: CommissionTotals }>(`/commission/entries${queryString(params)}`);
}

export function recomputeCommission(body: {
  billing_id?: string | null;
  period?: string | null;
}): Promise<{ recomputed: number; results: unknown[] }> {
  return api<{ recomputed: number; results: unknown[] }>("/commission/recompute", {
    method: "POST",
    body
  });
}

export function createCommissionEntry(body: CommissionEntryCreateInput): Promise<{ entry: CommissionEntry }> {
  return api<{ entry: CommissionEntry }>("/commission/entries", {
    method: "POST",
    body
  });
}

export function updateCommissionEntry(
  id: string,
  body: CommissionEntryUpdateInput
): Promise<{ entry: CommissionEntry }> {
  return api<{ entry: CommissionEntry }>(`/commission/entries/${id}`, {
    method: "PATCH",
    body
  });
}

export function getCommissionSummary(
  salesId: string,
  period: string
): Promise<{ sales_id: string; period: string; total: string; entries: CommissionEntry[] }> {
  return api<{ sales_id: string; period: string; total: string; entries: CommissionEntry[] }>(
    `/sales/${salesId}/commission-summary${queryString({ period })}`
  );
}
