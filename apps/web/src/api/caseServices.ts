import { type CaseServiceSource, type CaseServiceStatus } from "@bh/shared";
import { api } from "./client";
import { type ServiceItem } from "./epPackages";

export type CaseServiceCharge = {
  id: string;
  status: "pending" | "partial" | "paid" | "waived";
  amount_expected: string;
  amount_collected: string;
};

export type CaseService = {
  id: string;
  case_id: string;
  service_item_id: string;
  name_snapshot: string;
  service: Pick<ServiceItem, "id" | "code" | "name" | "name_en" | "category" | "default_price_sgd" | "billable">;
  source: CaseServiceSource;
  is_billable: boolean;
  price_sgd: string;
  charge_id?: string | null;
  charge: CaseServiceCharge | null;
  status: CaseServiceStatus;
  note?: string | null;
  created_at: string;
};

export type CaseServiceAddInput = {
  service_item_id: string;
  price_sgd?: number | string;
  note?: string;
};

export function listCaseServices(caseId: string): Promise<{ services: CaseService[] }> {
  return api<{ services: CaseService[] }>(`/cases/${caseId}/services`);
}

export function addCaseService(
  caseId: string,
  body: CaseServiceAddInput
): Promise<{ service: CaseService }> {
  return api<{ service: CaseService }>(`/cases/${caseId}/services`, { method: "POST", body });
}

export function removeCaseService(caseId: string, id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/cases/${caseId}/services/${id}`, { method: "DELETE" });
}
