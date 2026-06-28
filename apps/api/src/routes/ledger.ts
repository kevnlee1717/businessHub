import {
  bankAccounts,
  businesses,
  db,
  expenseCategories,
  ledgerEntries
} from "@bh/db";
import { ledgerCreateSchema, ledgerQuerySchema, ledgerUpdateSchema } from "@bh/shared";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { endOfDate, idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";
import { computeSgdEquivalent, serializeLedgerEntry } from "./ledgerUtils";

function hasOwn(input: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function proofMissing(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  const proofDocumentIds = (value as { proof_document_ids?: unknown }).proof_document_ids;
  return !Array.isArray(proofDocumentIds) || proofDocumentIds.length === 0;
}

function validateLedgerShape(input: {
  direction?: "in" | "out";
  currency?: "SGD" | "RMB";
  amount?: string | number;
  fx_rate?: string | number | null | undefined;
  business_id?: string | null | undefined;
  expense_category_id?: string | null | undefined;
  proof_document_ids?: string[];
}) {
  if (input.proof_document_ids && input.proof_document_ids.length === 0) {
    return { error: "proof_required" as const };
  }
  if (input.direction === "in" && !input.business_id) {
    return { error: "business_required" as const };
  }
  if (input.direction === "out" && !input.expense_category_id) {
    return { error: "category_required" as const };
  }
  if (
    input.currency &&
    input.currency !== "SGD" &&
    input.amount !== undefined &&
    (input.fx_rate === null || input.fx_rate === undefined)
  ) {
    return { error: "fx_rate_required" as const };
  }

  return null;
}

function serializeLedgerJoined(row: {
  ledger: typeof ledgerEntries.$inferSelect;
  business: Pick<typeof businesses.$inferSelect, "id" | "name" | "code"> | null;
  category: Pick<typeof expenseCategories.$inferSelect, "id" | "name" | "code"> | null;
  bankAccount: Pick<typeof bankAccounts.$inferSelect, "id" | "name" | "bankName"> | null;
}) {
  return {
    ...serializeLedgerEntry(row.ledger),
    business: row.business
      ? { id: row.business.id, name: row.business.name, code: row.business.code }
      : null,
    category: row.category
      ? { id: row.category.id, name: row.category.name, code: row.category.code }
      : null,
    bank_account: row.bankAccount
      ? { id: row.bankAccount.id, name: row.bankAccount.name, bank_name: row.bankAccount.bankName }
      : null
  };
}

export async function registerLedgerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/ledger", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(ledgerQuerySchema, request.query);
    const filters: SQL[] = [];
    const companyIds = await getAccessibleCompanyIds(request);
    const accessFilter = companyFilter(companyIds, ledgerEntries.companyId);

    if (accessFilter) {
      filters.push(accessFilter);
    }

    if (query.company_id) filters.push(eq(ledgerEntries.companyId, query.company_id));
    if (query.bank_account_id) filters.push(eq(ledgerEntries.bankAccountId, query.bank_account_id));
    if (query.direction) filters.push(eq(ledgerEntries.direction, query.direction));
    if (query.business_id) filters.push(eq(ledgerEntries.businessId, query.business_id));
    if (query.expense_category_id) {
      filters.push(eq(ledgerEntries.expenseCategoryId, query.expense_category_id));
    }
    if (query.reconcile_status) {
      filters.push(eq(ledgerEntries.reconcileStatus, query.reconcile_status));
    }
    if (query.from) filters.push(gte(ledgerEntries.occurredAt, new Date(query.from)));
    if (query.to) filters.push(lte(ledgerEntries.occurredAt, endOfDate(query.to)));

    const rows = await db
      .select({
        ledger: ledgerEntries,
        business: {
          id: businesses.id,
          name: businesses.name,
          code: businesses.code
        },
        category: {
          id: expenseCategories.id,
          name: expenseCategories.name,
          code: expenseCategories.code
        },
        bankAccount: {
          id: bankAccounts.id,
          name: bankAccounts.name,
          bankName: bankAccounts.bankName
        }
      })
      .from(ledgerEntries)
      .leftJoin(businesses, eq(ledgerEntries.businessId, businesses.id))
      .leftJoin(expenseCategories, eq(ledgerEntries.expenseCategoryId, expenseCategories.id))
      .leftJoin(bankAccounts, eq(ledgerEntries.bankAccountId, bankAccounts.id))
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(ledgerEntries.occurredAt), desc(ledgerEntries.createdAt));

    const totals = rows.reduce(
      (acc, row) => {
        const amount = Number(row.ledger.sgdEquivalent);
        if (row.ledger.direction === "in") {
          acc.in += amount;
        } else {
          acc.out += amount;
        }
        return acc;
      },
      { in: 0, out: 0 }
    );

    return {
      rows: rows.map(serializeLedgerJoined),
      totals: {
        in_sgd: totals.in.toFixed(2),
        out_sgd: totals.out.toFixed(2),
        net_sgd: (totals.in - totals.out).toFixed(2)
      }
    };
  });

  app.get("/ledger/proof-missing", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const query = parseWithSchema(z.object({ company_id: z.string().uuid() }), request.query);
    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all" && !companyIds.includes(query.company_id)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const rows = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.companyId, query.company_id), sql`cardinality(${ledgerEntries.proofDocumentIds}) = 0`)
      )
      .orderBy(desc(ledgerEntries.occurredAt));

    return { rows: rows.map(serializeLedgerEntry) };
  });

  app.get("/ledger/uncategorized", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const query = parseWithSchema(z.object({ company_id: z.string().uuid() }), request.query);
    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all" && !companyIds.includes(query.company_id)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const rows = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.companyId, query.company_id),
          sql`((${ledgerEntries.direction} = 'in' and ${ledgerEntries.businessId} is null) or (${ledgerEntries.direction} = 'out' and ${ledgerEntries.expenseCategoryId} is null))`
        )
      )
      .orderBy(desc(ledgerEntries.occurredAt));

    return { rows: rows.map(serializeLedgerEntry) };
  });

  app.post("/ledger", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    if (proofMissing(request.body)) {
      return reply.code(422).send({ error: "proof_required" });
    }

    const body = parseWithSchema(ledgerCreateSchema, request.body);
    const validation = validateLedgerShape(body);

    if (validation) {
      return reply.code(422).send(validation);
    }

    const sgd = computeSgdEquivalent(body.amount, body.currency, body.fx_rate);
    if (!sgd) {
      return reply.code(422).send({ error: "fx_rate_required" });
    }

    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        companyId: body.company_id,
        bankAccountId: body.bank_account_id,
        direction: body.direction,
        amount: toNumeric(body.amount) ?? "0",
        currency: body.currency,
        fxRate: sgd.fxRate,
        sgdEquivalent: sgd.sgdEquivalent,
        occurredAt: new Date(body.occurred_at),
        businessId: body.business_id,
        billingId: body.billing_id,
        expenseCategoryId: body.expense_category_id,
        counterparty: body.counterparty,
        proofDocumentIds: body.proof_document_ids,
        sourceType: "manual",
        recordedBy: request.user.id,
        note: body.note
      })
      .returning();

    if (!entry) {
      throw new Error("ledger_create_failed");
    }

    return reply.code(201).send({ ledger_entry: serializeLedgerEntry(entry) });
  });

  app.patch("/ledger/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    if (
      typeof request.body === "object" &&
      request.body !== null &&
      hasOwn(request.body, "proof_document_ids") &&
      proofMissing(request.body)
    ) {
      return reply.code(422).send({ error: "proof_required" });
    }

    const body = parseWithSchema(ledgerUpdateSchema, request.body);
    const [current] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }

    if (current.sourceType !== "manual") {
      const allowed = [
        "proof_document_ids",
        "note",
        "business_id",
        "billing_id",
        "expense_category_id",
        "counterparty"
      ];
      const blocked = Object.keys(body).some((key) => !allowed.includes(key));
      if (blocked) {
        return reply.code(422).send({ error: "source_locked" });
      }
    }

    const next = {
      direction: body.direction ?? current.direction,
      currency: body.currency ?? current.currency,
      amount: body.amount ?? current.amount,
      fx_rate: hasOwn(body, "fx_rate") ? body.fx_rate : current.fxRate,
      business_id: hasOwn(body, "business_id") ? body.business_id : current.businessId,
      expense_category_id: hasOwn(body, "expense_category_id")
        ? body.expense_category_id
        : current.expenseCategoryId,
      proof_document_ids: body.proof_document_ids ?? current.proofDocumentIds
    };
    const validation = validateLedgerShape(next);

    if (validation) {
      return reply.code(422).send(validation);
    }

    const sgd =
      hasOwn(body, "amount") || hasOwn(body, "currency") || hasOwn(body, "fx_rate")
        ? computeSgdEquivalent(next.amount, next.currency, next.fx_rate)
        : null;
    if ((hasOwn(body, "amount") || hasOwn(body, "currency") || hasOwn(body, "fx_rate")) && !sgd) {
      return reply.code(422).send({ error: "fx_rate_required" });
    }

    const [entry] = await db
      .update(ledgerEntries)
      .set({
        companyId: body.company_id,
        bankAccountId: body.bank_account_id,
        direction: body.direction,
        amount: body.amount === undefined ? undefined : (toNumeric(body.amount) as string),
        currency: body.currency,
        fxRate: sgd ? sgd.fxRate : body.fx_rate === null ? null : undefined,
        sgdEquivalent: sgd?.sgdEquivalent,
        occurredAt: body.occurred_at ? new Date(body.occurred_at) : undefined,
        businessId: hasOwn(body, "business_id") ? body.business_id : undefined,
        billingId: hasOwn(body, "billing_id") ? body.billing_id : undefined,
        expenseCategoryId: hasOwn(body, "expense_category_id") ? body.expense_category_id : undefined,
        counterparty: hasOwn(body, "counterparty") ? body.counterparty : undefined,
        proofDocumentIds: body.proof_document_ids,
        note: hasOwn(body, "note") ? body.note : undefined
      })
      .where(eq(ledgerEntries.id, id))
      .returning();

    if (!entry) {
      throw new Error("ledger_update_failed");
    }

    return { ledger_entry: serializeLedgerEntry(entry) };
  });

  app.delete("/ledger/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [current] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }
    if (current.sourceType !== "manual") {
      return reply.code(422).send({ error: "source_locked" });
    }

    await db.delete(ledgerEntries).where(eq(ledgerEntries.id, id));
    return { ok: true };
  });
}
