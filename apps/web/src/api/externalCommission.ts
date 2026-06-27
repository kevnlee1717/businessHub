import { type CommissionEntryStatus } from "@bh/shared";
import { type Business } from "./businessSchemes";
import { api } from "./client";
import { type ExternalParty } from "./externalParties";

export type ExternalCommissionEntryStatus = CommissionEntryStatus;

export type ExternalCommissionEntryRecord = {
  id: string;
  payee_id: string;
  business_id?: string | null;
  billing_id?: string | null;
  period: string;
  amount?: string | null;
  amount_sgd?: string | null;
  status: ExternalCommissionEntryStatus;
  settled_at?: string | null;
  bank_account_id?: string | null;
  proof_document_ids?: string[] | null;
  note?: string | null;
  created_at: string;
};

export type ExternalCommissionEntry = {
  entry: ExternalCommissionEntryRecord;
  payee?: Pick<ExternalParty, "id" | "name" | "name_en"> | null;
  business?: Pick<Business, "id" | "code" | "name" | "name_en"> | null;
};

export type ExternalCommissionEntryFilters = {
  payee_id?: string | null;
  business_id?: string | null;
  status?: ExternalCommissionEntryStatus | null;
};

export type ExternalCommissionSummary = {
  earned: string;
  settled: string;
  pending: string;
};

export type ExternalCommissionSummaryResponse = ExternalCommissionSummary | { summary: ExternalCommissionSummary };

export type ExternalCommissionSettleInput = {
  bank_account_id?: string | null;
  occurred_at?: string | null;
  proof_document_ids: string[];
  note?: string | null;
};

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

export function listExternalCommissionEntries(
  filters: ExternalCommissionEntryFilters = {}
): Promise<{ entries: ExternalCommissionEntry[] }> {
  return api<{ entries: ExternalCommissionEntry[] }>(`/external-commission/entries${queryString(filters)}`);
}

export function getExternalCommissionSummary(): Promise<ExternalCommissionSummaryResponse> {
  return api<ExternalCommissionSummaryResponse>("/external-commission/summary");
}

export function recomputeExternalCommission(): Promise<{ recomputed: number; results?: unknown[] }> {
  return api<{ recomputed: number; results?: unknown[] }>("/external-commission/recompute", {
    method: "POST"
  });
}

export function settleExternalCommission(
  id: string,
  body: ExternalCommissionSettleInput
): Promise<{ entry: ExternalCommissionEntryRecord }> {
  return api<{ entry: ExternalCommissionEntryRecord }>(`/external-commission/${id}/settle`, {
    method: "POST",
    body
  });
}
