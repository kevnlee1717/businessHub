import {
  type BankAccountCreateInput,
  type BankAccountUpdateInput,
  type Currency,
  type ExpenseCategoryCreateInput,
  type ExpenseCategoryUpdateInput,
  type LedgerCreateInput,
  type LedgerDirection,
  type LedgerSource,
  type LedgerUpdateInput,
  type MatchInput,
  type ReconcileStatus,
  type StatementLinesImportInput
} from "@bh/shared";
import { api } from "./client";
import { uploadDocument } from "./dms";

export type BankAccount = {
  id: string;
  company_id: string;
  name: string;
  bank_name?: string | null;
  account_no?: string | null;
  currency: Currency;
  is_primary: boolean;
  opening_balance: string;
  opening_date?: string | null;
  active: boolean;
  note?: string | null;
  created_at: string;
};

export type ExpenseCategory = {
  id: string;
  code: string;
  name: string;
  name_en?: string | null;
  active: boolean;
  is_system: boolean;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  company_id: string;
  bank_account_id?: string | null;
  direction: LedgerDirection;
  amount: string;
  currency: Currency;
  fx_rate?: string | null;
  sgd_equivalent: string;
  occurred_at: string;
  business_id?: string | null;
  billing_id?: string | null;
  expense_category_id?: string | null;
  counterparty?: string | null;
  proof_document_ids: string[];
  source_type: LedgerSource;
  source_id?: string | null;
  reconcile_status: ReconcileStatus;
  statement_line_id?: string | null;
  note?: string | null;
  recorded_by?: string | null;
  created_at: string;
  business_name?: string | null;
  expense_category_name?: string | null;
  bank_account_name?: string | null;
  business?: { id: string; name: string; code?: string | null } | null;
  category?: { id: string; name: string; code?: string | null } | null;
  bank_account?: { id: string; name: string; bank_name?: string | null } | null;
};

export type LedgerListParams = {
  company_id?: string | null;
  bank_account_id?: string | null;
  direction?: LedgerDirection | null;
  business_id?: string | null;
  expense_category_id?: string | null;
  reconcile_status?: ReconcileStatus | null;
  from?: string | null;
  to?: string | null;
};

export type PaginationParams = {
  page?: number | undefined;
  page_size?: number | undefined;
};

export type BankStatementLine = {
  id: string;
  bank_account_id: string;
  occurred_at: string;
  direction: LedgerDirection;
  amount: string;
  currency: Currency;
  description?: string | null;
  balance_after?: string | null;
  import_batch?: string | null;
  matched: boolean;
  ledger_entry_id?: string | null;
  note?: string | null;
  created_at: string;
};

export type ReconcileSuggestion = {
  ledger_entry_id: string;
  statement_line_id: string;
  amount: string;
  day_diff: number;
};

export type ReconcileResult = {
  system_unreconciled: LedgerEntry[];
  statement_unmatched: BankStatementLine[];
  suggestions: ReconcileSuggestion[];
  totals: {
    system_in: string;
    system_out: string;
    statement_in: string;
    statement_out: string;
    system_unreconciled_count: number;
    statement_unmatched_count: number;
  };
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

export function listBankAccounts(params: ({ company_id?: string | null } & PaginationParams) = {}): Promise<{
  bank_accounts: BankAccount[];
  total?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
}> {
  return api(`/bank-accounts${queryString(params)}`);
}

export function createBankAccount(body: BankAccountCreateInput): Promise<{ bank_account: BankAccount }> {
  return api<{ bank_account: BankAccount }>("/bank-accounts", { method: "POST", body });
}

export function updateBankAccount(id: string, body: BankAccountUpdateInput): Promise<{ bank_account: BankAccount }> {
  return api<{ bank_account: BankAccount }>(`/bank-accounts/${id}`, { method: "PATCH", body });
}

export function listExpenseCategories(): Promise<{ expense_categories: ExpenseCategory[] }> {
  return api<{ expense_categories: ExpenseCategory[] }>("/expense-categories");
}

export function createExpenseCategory(body: ExpenseCategoryCreateInput): Promise<{ expense_category: ExpenseCategory }> {
  return api<{ expense_category: ExpenseCategory }>("/expense-categories", { method: "POST", body });
}

export function updateExpenseCategory(
  id: string,
  body: ExpenseCategoryUpdateInput
): Promise<{ expense_category: ExpenseCategory }> {
  return api<{ expense_category: ExpenseCategory }>(`/expense-categories/${id}`, { method: "PATCH", body });
}

export function listLedger(params: LedgerListParams = {}): Promise<{
  rows: LedgerEntry[];
  totals: { in_sgd: string; out_sgd: string; net_sgd: string };
}> {
  return api(`/ledger${queryString(params)}`);
}

export function createLedgerEntry(body: LedgerCreateInput): Promise<{ ledger_entry: LedgerEntry }> {
  return api<{ ledger_entry: LedgerEntry }>("/ledger", { method: "POST", body });
}

export function updateLedgerEntry(id: string, body: LedgerUpdateInput): Promise<{ ledger_entry: LedgerEntry }> {
  return api<{ ledger_entry: LedgerEntry }>(`/ledger/${id}`, { method: "PATCH", body });
}

export function deleteLedgerEntry(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/ledger/${id}`, { method: "DELETE" });
}

export function ignoreLedgerEntry(id: string): Promise<{ ledger_entry: LedgerEntry }> {
  return api<{ ledger_entry: LedgerEntry }>(`/ledger/${id}/ignore`, { method: "POST" });
}

export function listProofMissing(companyId: string): Promise<{ rows: LedgerEntry[] }> {
  return api<{ rows: LedgerEntry[] }>(`/ledger/proof-missing${queryString({ company_id: companyId })}`);
}

export function listUncategorized(companyId: string): Promise<{ rows: LedgerEntry[] }> {
  return api<{ rows: LedgerEntry[] }>(`/ledger/uncategorized${queryString({ company_id: companyId })}`);
}

export function importStatementLines(
  bankAccountId: string,
  body: StatementLinesImportInput
): Promise<{ statement_lines: BankStatementLine[]; import_batch: string }> {
  return api<{ statement_lines: BankStatementLine[]; import_batch: string }>(
    `/bank-accounts/${bankAccountId}/statement-lines`,
    { method: "POST", body }
  );
}

export function listStatementLines(
  bankAccountId: string,
  params: { from?: string | null; to?: string | null } = {}
): Promise<{ statement_lines: BankStatementLine[] }> {
  return api<{ statement_lines: BankStatementLine[] }>(
    `/bank-accounts/${bankAccountId}/statement-lines${queryString(params)}`
  );
}

export function getReconcile(
  bankAccountId: string,
  params: { from?: string | null; to?: string | null } = {}
): Promise<ReconcileResult> {
  return api<ReconcileResult>(`/bank-accounts/${bankAccountId}/reconcile${queryString(params)}`);
}

export function matchReconcile(body: MatchInput): Promise<{
  ledger_entry: LedgerEntry;
  statement_line: BankStatementLine;
}> {
  return api<{ ledger_entry: LedgerEntry; statement_line: BankStatementLine }>("/reconcile/match", {
    method: "POST",
    body
  });
}

export function unmatchReconcile(ledgerEntryId: string): Promise<{ ledger_entry: LedgerEntry }> {
  return api<{ ledger_entry: LedgerEntry }>("/reconcile/unmatch", {
    method: "POST",
    body: { ledger_entry_id: ledgerEntryId }
  });
}

export async function uploadProofDocument(file: File): Promise<{ id: string }> {
  const { document } = await uploadDocument({
    file,
    subject_type: "ledger_entry",
    tags: ["ledger-proof"]
  });

  return { id: document.id };
}
