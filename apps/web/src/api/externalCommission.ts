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
  amount_settled?: string | null;
  outstanding?: string | null;
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
  business?: (Pick<Business, "id" | "name" | "name_en"> & { code?: string | null | undefined }) | null;
};

export type ExternalCommissionEntryFilters = {
  payee_id?: string | null;
  business_id?: string | null;
  status?: ExternalCommissionEntryStatus | null;
  page?: number | undefined;
  page_size?: number | undefined;
};

export type ExternalCommissionSummary = {
  earned?: string;
  pending?: string;
  total: string;
  settled: string;
  outstanding: string;
};

export type ExternalCommissionSummaryResponse = ExternalCommissionSummary | { summary: ExternalCommissionSummary };

export type ExternalCommissionSettleInput = {
  amount?: number | null;
  bank_account_id?: string | null;
  occurred_at?: string | null;
  proof_document_ids: string[];
  note?: string | null;
};

export type ExternalCommissionUpdateInput = {
  amount_sgd?: number;
  note?: string | null;
};

type RawJoinedName = {
  id: string | null;
  code?: string | null;
  name: string | null;
  nameEn?: string | null;
  name_en?: string | null;
};

type RawExternalCommissionEntry = ExternalCommissionEntryRecord & {
  payee?: RawJoinedName | null;
  business?: RawJoinedName | null;
};

function queryString(params: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const trimmed = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
    if (trimmed) {
      searchParams.set(key, trimmed);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listExternalCommissionEntries(
  filters: ExternalCommissionEntryFilters = {}
): Promise<{
  entries: ExternalCommissionEntry[];
  total?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
}> {
  return api<{
    entries: (ExternalCommissionEntry | RawExternalCommissionEntry)[];
    total?: number | undefined;
    page?: number | undefined;
    page_size?: number | undefined;
  }>(`/external-commission/entries${queryString(filters)}`).then((response) => ({
    ...response,
    entries: response.entries.map((row): ExternalCommissionEntry => {
      if ("entry" in row) {
        return row;
      }

      return {
        entry: row,
        ...(row.payee !== undefined
          ? {
              payee: row.payee
                ? {
                    id: row.payee.id ?? "",
                    name: row.payee.name ?? "",
                    name_en: row.payee.name_en ?? row.payee.nameEn ?? null
                  }
                : null
            }
          : {}),
        ...(row.business !== undefined
          ? {
              business: row.business
                ? {
                    id: row.business.id ?? "",
                    ...(row.business.code !== undefined ? { code: row.business.code } : {}),
                    name: row.business.name ?? "",
                    name_en: row.business.name_en ?? row.business.nameEn ?? null
                  }
                : null
            }
          : {})
      };
    })
  }));
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

export function updateExternalCommission(
  id: string,
  body: ExternalCommissionUpdateInput
): Promise<{ entry: ExternalCommissionEntryRecord }> {
  return api<{ entry: ExternalCommissionEntryRecord }>(`/external-commission/${id}`, {
    method: "PATCH",
    body
  });
}
