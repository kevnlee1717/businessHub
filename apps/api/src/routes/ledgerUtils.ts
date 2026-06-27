import {
  bankAccounts,
  bankStatementLines,
  billing,
  businesses,
  companyExpenses,
  db,
  documents,
  expenseCategories,
  ledgerEntries,
  payments
} from "@bh/db";
import { and, eq } from "drizzle-orm";
import { toNumeric } from "./hrUtils";
import type { DbExecutor } from "./financeUtils";

export type Currency = "SGD" | "RMB";

export function computeSgdEquivalent(
  amount: string | number,
  currency: Currency,
  fxRate: string | number | null | undefined
) {
  const numericAmount = Number(amount);

  if (currency === "SGD") {
    return { sgdEquivalent: numericAmount.toFixed(2), fxRate: toNumeric(fxRate) };
  }

  if (fxRate === null || fxRate === undefined) {
    return null;
  }

  return {
    sgdEquivalent: (numericAmount * Number(fxRate)).toFixed(2),
    fxRate: toNumeric(fxRate)
  };
}

export function serializeBankAccount(row: typeof bankAccounts.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    bank_name: row.bankName,
    account_no: row.accountNo,
    currency: row.currency,
    is_primary: row.isPrimary,
    opening_balance: row.openingBalance,
    opening_date: row.openingDate,
    active: row.active,
    note: row.note,
    created_at: row.createdAt
  };
}

export function serializeExpenseCategory(row: typeof expenseCategories.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    name_en: row.nameEn,
    active: row.active,
    is_system: row.isSystem,
    created_at: row.createdAt
  };
}

export function serializeLedgerEntry(row: typeof ledgerEntries.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    bank_account_id: row.bankAccountId,
    direction: row.direction,
    amount: row.amount,
    currency: row.currency,
    fx_rate: row.fxRate,
    sgd_equivalent: row.sgdEquivalent,
    occurred_at: row.occurredAt,
    business_id: row.businessId,
    billing_id: row.billingId,
    expense_category_id: row.expenseCategoryId,
    counterparty: row.counterparty,
    proof_document_ids: row.proofDocumentIds,
    source_type: row.sourceType,
    source_id: row.sourceId,
    reconcile_status: row.reconcileStatus,
    statement_line_id: row.statementLineId,
    note: row.note,
    recorded_by: row.recordedBy,
    created_at: row.createdAt
  };
}

export function serializeStatementLine(row: typeof bankStatementLines.$inferSelect) {
  return {
    id: row.id,
    bank_account_id: row.bankAccountId,
    occurred_at: row.occurredAt,
    direction: row.direction,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    balance_after: row.balanceAfter,
    import_batch: row.importBatch,
    matched: row.matched,
    ledger_entry_id: row.ledgerEntryId,
    note: row.note,
    created_at: row.createdAt
  };
}

async function primaryBankAccountId(companyId: string, tx: DbExecutor) {
  const [account] = await tx
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isPrimary, true)))
    .limit(1);

  return account?.id ?? null;
}

async function upsertLedgerBySource(
  values: typeof ledgerEntries.$inferInsert,
  tx: DbExecutor
) {
  if (!values.sourceId) {
    return null;
  }

  const [existing] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.sourceType, values.sourceType ?? "manual"),
        eq(ledgerEntries.sourceId, values.sourceId)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await tx
      .update(ledgerEntries)
      .set(values)
      .where(eq(ledgerEntries.id, existing.id))
      .returning();
    return updated ?? null;
  }

  const [inserted] = await tx.insert(ledgerEntries).values(values).returning();
  return inserted ?? null;
}

export async function bridgePaymentToLedger(
  payment: typeof payments.$inferSelect,
  billingRow: typeof billing.$inferSelect,
  recordedBy: string,
  tx: DbExecutor = db
) {
  if (!billingRow.businessId) {
    return null;
  }

  const [business] = await tx
    .select({ companyId: businesses.companyId })
    .from(businesses)
    .where(eq(businesses.id, billingRow.businessId))
    .limit(1);

  if (!business) {
    return null;
  }

  const proofRows = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.subjectType, "payment"), eq(documents.subjectId, payment.id)));
  const proofDocumentIds = proofRows.map((row) => row.id);

  return upsertLedgerBySource(
    {
      companyId: business.companyId,
      bankAccountId: await primaryBankAccountId(business.companyId, tx),
      direction: "in",
      amount: payment.paidAmount,
      currency: payment.paidCurrency,
      fxRate: payment.fxRate,
      sgdEquivalent: payment.sgdEquivalent,
      occurredAt: payment.paidAt,
      businessId: billingRow.businessId,
      billingId: billingRow.id,
      proofDocumentIds,
      sourceType: "payment",
      sourceId: payment.id,
      recordedBy
    },
    tx
  );
}

export async function bridgeCompanyExpenseToLedger(
  expense: typeof companyExpenses.$inferSelect,
  recordedBy: string,
  tx: DbExecutor = db
) {
  const categoryCode = expense.type === "rent" || expense.type === "utility" ? expense.type : "other";
  const [category] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.code, categoryCode))
    .limit(1);

  const sgd = computeSgdEquivalent(expense.amount, expense.currency, null);
  if (!sgd) {
    return null;
  }

  return upsertLedgerBySource(
    {
      companyId: expense.companyId,
      bankAccountId: await primaryBankAccountId(expense.companyId, tx),
      direction: "out",
      amount: expense.amount,
      currency: expense.currency,
      fxRate: null,
      sgdEquivalent: sgd.sgdEquivalent,
      occurredAt: expense.paidAt ?? expense.createdAt,
      expenseCategoryId: category?.id ?? null,
      proofDocumentIds: expense.documentId ? [expense.documentId] : [],
      sourceType: "company_expense",
      sourceId: expense.id,
      note: expense.note,
      recordedBy
    },
    tx
  );
}
