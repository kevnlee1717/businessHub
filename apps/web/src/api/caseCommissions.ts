import { type CaseCommissionInput, type CommissionBasis, type CommissionEntryStatus, type CommissionRecurrence, type CommissionTarget } from "@bh/shared";
import { api } from "./client";

export type CaseCommission = {
  id: string;
  case_id: string;
  target: CommissionTarget;
  party_id?: string | null;
  external_party_id?: string | null;
  basis: CommissionBasis;
  value: string;
  note?: string | null;
  created_at: string;
};

export type EffectiveInternalCommissionEntry = {
  id: string;
  sales_id: string;
  billing_id: string;
  business_id?: string | null;
  period: string;
  recurrence: CommissionRecurrence;
  seq: number;
  milestone_seq?: number | null;
  amount_sgd: string;
  amount_override?: string | null;
  effective_amount_sgd: string;
  status: CommissionEntryStatus;
  source_line_id?: string | null;
  note?: string | null;
  created_at: string;
};

export type EffectiveExternalCommissionEntry = {
  id: string;
  payee_id: string;
  billing_id: string;
  business_id?: string | null;
  party_id?: string | null;
  period: string;
  recurrence: CommissionRecurrence;
  seq: number;
  milestone_seq?: number | null;
  amount_sgd: string;
  amount_settled: string;
  status: CommissionEntryStatus;
  source_line_id?: string | null;
  note?: string | null;
  created_at: string;
};

export type CaseEffectiveCommissions = {
  internal_sales: {
    amount_sgd: string;
    entries: EffectiveInternalCommissionEntry[];
  };
  external_channel: {
    amount_sgd: string;
    entries: EffectiveExternalCommissionEntry[];
  };
};

export type CaseCommissionResponse = {
  commissions: CaseCommission[];
  effective_commissions: CaseEffectiveCommissions;
};

export function listCaseCommissions(caseId: string): Promise<CaseCommissionResponse> {
  return api<CaseCommissionResponse>(`/cases/${caseId}/commissions`);
}

export function setCaseCommissions(
  caseId: string,
  rules: CaseCommissionInput[]
): Promise<{ case_id: string } & CaseCommissionResponse> {
  return api<{ case_id: string } & CaseCommissionResponse>(`/cases/${caseId}/commissions`, {
    method: "PUT",
    body: rules
  });
}

export function recomputeCaseCommission(caseId: string): Promise<{
  billing_id: string;
  internal: unknown;
  external: unknown;
}> {
  return api<{ billing_id: string; internal: unknown; external: unknown }>(`/cases/${caseId}/commission/recompute`, {
    method: "POST"
  });
}
