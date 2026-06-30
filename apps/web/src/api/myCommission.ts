import { api } from "./client";

export type MyCommissionStatus = "pending" | "settled" | "void";

export type MyCommissionEntry = {
  billing_id: string;
  business?: {
    code?: string | null;
    name?: string | null;
    name_en?: string | null;
  } | null;
  period: string;
  amount_sgd: string;
  status: MyCommissionStatus;
  payslip_id?: string | null;
  recurrence?: string | null;
  created_at: string;
};

type RawMyCommissionEntry = Omit<MyCommissionEntry, "business"> & {
  business?: {
    code?: string | null;
    name?: string | null;
    nameEn?: string | null;
    name_en?: string | null;
  } | null;
};

export type MyCommissionParams = {
  page?: number | undefined;
  page_size?: number | undefined;
};

function queryString(params: Record<string, number | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function getMyCommission(params: MyCommissionParams = {}): Promise<{
  entries: MyCommissionEntry[];
  total?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
}> {
  return api<{
    entries: RawMyCommissionEntry[];
    total?: number | undefined;
    page?: number | undefined;
    page_size?: number | undefined;
  }>(`/commission/mine${queryString(params)}`).then((response) => ({
    ...response,
    entries: response.entries.map((entry) => ({
      ...entry,
      ...(entry.business !== undefined
        ? {
            business: entry.business
              ? {
                  ...(entry.business.code !== undefined ? { code: entry.business.code } : {}),
                  ...(entry.business.name !== undefined ? { name: entry.business.name } : {}),
                  name_en: entry.business.name_en ?? entry.business.nameEn ?? null
                }
              : null
          }
        : {})
    }))
  }));
}
