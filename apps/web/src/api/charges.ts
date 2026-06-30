import { type Currency } from "@bh/shared";
import { api } from "./client";
import { uploadProofDocument } from "./ledger";

export type ChargeKind = "milestone" | "period" | "event";
export type ChargeStatus = "pending" | "partial" | "paid" | "waived";
export type MilestoneBasis = "percent" | "fixed";

export type Charge = {
  id: string;
  billing_id: string;
  scheme_line_id?: string | null;
  charge_kind: ChargeKind;
  seq: number;
  label: string;
  period?: string | null;
  due_date?: string | null;
  case_step_id?: string | null;
  amount_expected: string;
  amount_collected: string;
  status: ChargeStatus;
  currency: Currency;
  business_id?: string | null;
  business_name?: string | null;
  company_id?: string | null;
  company_name?: string | null;
};

export type ChargeTotals = {
  expected: string;
  collected: string;
  outstanding: string;
};

export type ChargeListParams = {
  company_id?: string | null;
  business_id?: string | null;
  status?: ChargeStatus | null;
  period?: string | null;
  overdue?: string | boolean | null;
};

export type ChargeCreateInput = {
  billing_id: string;
  label: string;
  amount_expected: number;
  charge_kind?: ChargeKind;
  period?: string | null;
  due_date?: string | null;
  case_step_id?: string | null;
};

export type ChargeUpdateInput = {
  label?: string;
  due_date?: string | null;
  case_step_id?: string | null;
  amount_expected?: number;
  status?: "waived";
};

export type ChargeCollectInput = {
  paid_amount: number;
  currency: Currency;
  fx_rate?: number | null;
  paid_at: string;
  proof_document_ids: string[];
  bank_account_id?: string | null;
  note?: string | null;
};

export type ChargeCollectWithProofsInput = Omit<ChargeCollectInput, "proof_document_ids"> & {
  proof_files: File[];
};

export type SchemeMilestone = {
  id: string;
  version_id: string;
  seq: number;
  label: string;
  collection_item_id?: string | null;
  basis: MilestoneBasis;
  value: string;
  bind_step_order?: number | null;
  due_offset_days?: number | null;
  note?: string | null;
};

export type SchemeMilestoneInput = {
  seq: number;
  label?: string;
  collection_item_id?: string | null;
  basis: MilestoneBasis;
  value: number;
  bind_step_order?: number | null;
  due_offset_days?: number | null;
  note?: string | null;
};

function queryString(params: Record<string, string | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "boolean") {
      if (value) {
        searchParams.set(key, "true");
      }
      return;
    }

    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) {
      searchParams.set(key, trimmed);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listBillingCharges(billingId: string): Promise<{ charges: Charge[] }> {
  return api<{ charges: Charge[] }>(`/billing/${billingId}/charges`);
}

export function listCaseCharges(caseId: string): Promise<{ charges: Charge[] }> {
  return api<{ charges: Charge[] }>(`/cases/${caseId}/charges`);
}

export async function listCharges(params: ChargeListParams = {}): Promise<{ charges: Charge[]; totals: ChargeTotals }> {
  const response = await api<{ charges?: Charge[]; rows?: Charge[]; totals: ChargeTotals }>(`/charges${queryString(params)}`);
  return { charges: response.charges ?? response.rows ?? [], totals: response.totals };
}

export function createCharge(body: ChargeCreateInput): Promise<{ charge: Charge }> {
  return api<{ charge: Charge }>("/charges", { method: "POST", body });
}

export function updateCharge(id: string, body: ChargeUpdateInput): Promise<{ charge: Charge }> {
  return api<{ charge: Charge }>(`/charges/${id}`, { method: "PATCH", body });
}

export function deleteCharge(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/charges/${id}`, { method: "DELETE" });
}

export function collectCharge(id: string, body: ChargeCollectInput): Promise<{ charge: Charge }> {
  return api<{ charge: Charge }>(`/charges/${id}/collect`, { method: "POST", body });
}

export async function collectChargeWithProofs(
  id: string,
  body: ChargeCollectWithProofsInput
): Promise<{ charge: Charge }> {
  const proofDocuments = [];
  for (const file of body.proof_files) {
    proofDocuments.push(await uploadProofDocument(file));
  }

  return collectCharge(id, {
    ...body,
    proof_document_ids: proofDocuments.map((document) => document.id)
  });
}

export function listSchemeMilestones(versionId: string): Promise<{ milestones: SchemeMilestone[] }> {
  return api<{ milestones: SchemeMilestone[] }>(`/scheme-versions/${versionId}/milestones`);
}

export function createSchemeMilestone(
  versionId: string,
  body: SchemeMilestoneInput
): Promise<{ milestone: SchemeMilestone }> {
  return api<{ milestone: SchemeMilestone }>(`/scheme-versions/${versionId}/milestones`, { method: "POST", body });
}

export function updateSchemeMilestone(
  id: string,
  body: Partial<SchemeMilestoneInput>
): Promise<{ milestone: SchemeMilestone }> {
  return api<{ milestone: SchemeMilestone }>(`/scheme-milestones/${id}`, { method: "PATCH", body });
}

export function deleteSchemeMilestone(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/scheme-milestones/${id}`, { method: "DELETE" });
}
