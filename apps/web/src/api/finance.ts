import {
  type BillingCreateInput,
  type BillingUpdateInput,
  type PaymentCreateInput
} from "@bh/shared";
import { api } from "./client";

export type Billing = {
  id: string;
  ref_type: string;
  ref_id: string;
  total_price_sgd: string;
  deposit_sgd: string;
  status: string;
  sales_id?: string | null;
  commission_type?: string | null;
  commission_value?: string | null;
  commission_amount_sgd: string;
  business_id?: string | null;
  scheme_version_id?: string | null;
  external_payees?: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  billing_id: string;
  paid_currency: string;
  paid_amount: string;
  fx_rate?: string | null;
  sgd_equivalent: string;
  type: string;
  recorded_by?: string | null;
  paid_at: string;
  note?: string | null;
};

export type PriceAdjustment = {
  id: string;
  billing_id: string;
  field: string;
  old_value: string;
  new_value: string;
  changed_by?: string | null;
  changed_at: string;
};

export type BillingDetail = {
  billing: Billing;
  payments: Payment[];
  adjustments: PriceAdjustment[];
  paid_total: string;
  balance: string;
};

export type BillingListParams = {
  ref_type?: string | null | undefined;
  ref_id?: string | null | undefined;
  status?: string | null | undefined;
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

export function listBilling(params: BillingListParams = {}): Promise<{ billings: Billing[] }> {
  return api<{ billings: Billing[] }>(`/billing${queryString(params)}`);
}

export function getBilling(id: string): Promise<BillingDetail> {
  return api<BillingDetail>(`/billing/${id}`);
}

export function createBilling(body: BillingCreateInput): Promise<{ billing: Billing }> {
  return api<{ billing: Billing }>("/billing", {
    method: "POST",
    body
  });
}

export function updateBilling(id: string, body: BillingUpdateInput): Promise<{ billing: Billing }> {
  return api<{ billing: Billing }>(`/billing/${id}`, {
    method: "PATCH",
    body
  });
}

export function createPayment(
  billingId: string,
  body: PaymentCreateInput
): Promise<{ payment: Payment; billing: Billing }> {
  return api<{ payment: Payment; billing: Billing }>(`/billing/${billingId}/payments`, {
    method: "POST",
    body
  });
}

export function deletePayment(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/payments/${id}`, {
    method: "DELETE"
  });
}
