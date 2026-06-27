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

export function getMyCommission(): Promise<{ entries: MyCommissionEntry[] }> {
  return api<{ entries: MyCommissionEntry[] }>("/commission/mine");
}
