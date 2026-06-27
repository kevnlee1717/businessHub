import { api } from "./client";

export type StatementStatus = "pending" | "settled" | "void";

export type StatementResponse = {
  payee: {
    id?: string;
    name: string;
    name_en?: string | null;
    contact?: string | null;
    role?: {
      id?: string;
      name?: string | null;
      name_en?: string | null;
    } | null;
  };
  entries: {
    id?: string;
    billing_id?: string | null;
    business?: {
      code?: string | null;
      name?: string | null;
      name_en?: string | null;
    } | null;
    billing?: {
      ref_type?: string | null;
      deal_at?: string | null;
    } | null;
    customer?: {
      name?: string | null;
      name_en?: string | null;
    } | null;
    period?: string | null;
    amount_sgd: string;
    status: StatementStatus;
  }[];
  totals: {
    total: string;
    settled: string;
    outstanding: string;
  };
};

export function getStatement(token: string): Promise<StatementResponse> {
  return api<StatementResponse>(`/statement/${encodeURIComponent(token)}`);
}
