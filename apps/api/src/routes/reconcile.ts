import { bankAccounts, bankStatementLines, db, ledgerEntries } from "@bh/db";
import { matchSchema, statementLinesImportSchema } from "@bh/shared";
import { and, asc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { endOfDate, idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";
import { serializeLedgerEntry, serializeStatementLine } from "./ledgerUtils";

const periodQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional()
});

function dateFilters<T extends { occurredAt: unknown }>(
  table: T,
  from?: string,
  to?: string
): SQL[] {
  const filters: SQL[] = [];
  if (from) filters.push(gte(table.occurredAt as never, new Date(from)));
  if (to) filters.push(lte(table.occurredAt as never, endOfDate(to)));
  return filters;
}

function dayDiff(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000);
}

export async function registerReconcileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.post(
    "/bank-accounts/:id/statement-lines",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const body = parseWithSchema(statementLinesImportSchema, request.body);
      const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1);

      if (!account) {
        return sendNotFound(reply);
      }

      const importBatch = body.import_batch ?? `import-${id.slice(0, 8)}-${Date.now()}`;
      const rows = await db
        .insert(bankStatementLines)
        .values(
          body.lines.map((line) => ({
            bankAccountId: id,
            occurredAt: new Date(line.occurred_at),
            direction: line.direction,
            amount: toNumeric(line.amount) ?? "0",
            currency: line.currency ?? account.currency,
            description: line.description,
            balanceAfter: toNumeric(line.balance_after),
            importBatch
          }))
        )
        .returning();

      return reply.code(201).send({ statement_lines: rows.map(serializeStatementLine), import_batch: importBatch });
    }
  );

  app.get(
    "/bank-accounts/:id/statement-lines",
    { preHandler: requirePerm("finance.view") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const query = parseWithSchema(periodQuerySchema, request.query);
      const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1);

      if (!account) {
        return sendNotFound(reply);
      }

      const filters = [eq(bankStatementLines.bankAccountId, id), ...dateFilters(bankStatementLines, query.from, query.to)];
      const rows = await db
        .select()
        .from(bankStatementLines)
        .where(and(...filters))
        .orderBy(asc(bankStatementLines.occurredAt), asc(bankStatementLines.createdAt));

      return { statement_lines: rows.map(serializeStatementLine) };
    }
  );

  app.get(
    "/bank-accounts/:id/reconcile",
    { preHandler: requirePerm("finance.view") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const query = parseWithSchema(periodQuerySchema, request.query);
      const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1);

      if (!account) {
        return sendNotFound(reply);
      }

      const ledgerFilters = [
        eq(ledgerEntries.bankAccountId, id),
        eq(ledgerEntries.reconcileStatus, "unreconciled" as const),
        ...dateFilters(ledgerEntries, query.from, query.to)
      ];
      const statementFilters = [
        eq(bankStatementLines.bankAccountId, id),
        eq(bankStatementLines.matched, false),
        ...dateFilters(bankStatementLines, query.from, query.to)
      ];

      const systemRows = await db
        .select()
        .from(ledgerEntries)
        .where(and(...ledgerFilters))
        .orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.createdAt));
      const statementRows = await db
        .select()
        .from(bankStatementLines)
        .where(and(...statementFilters))
        .orderBy(asc(bankStatementLines.occurredAt), asc(bankStatementLines.createdAt));

      const candidates = systemRows
        .flatMap((entry) =>
          statementRows
            .filter(
              (line) =>
                line.direction === entry.direction &&
                Number(line.amount) === Number(entry.amount) &&
                dayDiff(line.occurredAt, entry.occurredAt) <= 3
            )
            .map((line) => ({
              ledger_entry_id: entry.id,
              statement_line_id: line.id,
              amount: entry.amount,
              day_diff: Number(dayDiff(line.occurredAt, entry.occurredAt).toFixed(3))
            }))
        )
        .sort((a, b) => a.day_diff - b.day_diff);

      const usedEntries = new Set<string>();
      const usedLines = new Set<string>();
      const suggestions = candidates.filter((candidate) => {
        if (usedEntries.has(candidate.ledger_entry_id) || usedLines.has(candidate.statement_line_id)) {
          return false;
        }
        usedEntries.add(candidate.ledger_entry_id);
        usedLines.add(candidate.statement_line_id);
        return true;
      });

      const ledgerTotals = systemRows.reduce(
        (acc, row) => {
          if (row.direction === "in") acc.in += Number(row.amount);
          else acc.out += Number(row.amount);
          return acc;
        },
        { in: 0, out: 0 }
      );
      const statementTotals = statementRows.reduce(
        (acc, row) => {
          if (row.direction === "in") acc.in += Number(row.amount);
          else acc.out += Number(row.amount);
          return acc;
        },
        { in: 0, out: 0 }
      );

      return {
        system_unreconciled: systemRows.map(serializeLedgerEntry),
        statement_unmatched: statementRows.map(serializeStatementLine),
        suggestions,
        totals: {
          system_in: ledgerTotals.in.toFixed(2),
          system_out: ledgerTotals.out.toFixed(2),
          statement_in: statementTotals.in.toFixed(2),
          statement_out: statementTotals.out.toFixed(2),
          system_unreconciled_count: systemRows.length,
          statement_unmatched_count: statementRows.length
        }
      };
    }
  );

  app.post("/reconcile/match", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(matchSchema, request.body);

    const result = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.id, body.ledger_entry_id))
        .limit(1);
      const [line] = await tx
        .select()
        .from(bankStatementLines)
        .where(eq(bankStatementLines.id, body.statement_line_id))
        .limit(1);

      if (!entry || !line) return { error: "not_found" as const };
      if (entry.bankAccountId !== line.bankAccountId) return { error: "account_mismatch" as const };
      if (entry.statementLineId || entry.reconcileStatus === "reconciled" || line.matched || line.ledgerEntryId) {
        return { error: "already_matched" as const };
      }

      const [updatedEntry] = await tx
        .update(ledgerEntries)
        .set({ statementLineId: line.id, reconcileStatus: "reconciled" })
        .where(eq(ledgerEntries.id, entry.id))
        .returning();
      const [updatedLine] = await tx
        .update(bankStatementLines)
        .set({ matched: true, ledgerEntryId: entry.id })
        .where(eq(bankStatementLines.id, line.id))
        .returning();

      if (!updatedEntry || !updatedLine) {
        return { error: "match_failed" as const };
      }

      return { entry: updatedEntry, line: updatedLine };
    });

    if ("error" in result) {
      const status = result.error === "not_found" ? 404 : 422;
      return reply.code(status).send({ error: result.error });
    }

    return {
      ledger_entry: serializeLedgerEntry(result.entry),
      statement_line: serializeStatementLine(result.line)
    };
  });

  app.post("/reconcile/unmatch", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(z.object({ ledger_entry_id: z.string().uuid() }), request.body);

    const result = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.id, body.ledger_entry_id))
        .limit(1);

      if (!entry) {
        return null;
      }

      if (entry.statementLineId) {
        await tx
          .update(bankStatementLines)
          .set({ matched: false, ledgerEntryId: null })
          .where(eq(bankStatementLines.id, entry.statementLineId));
      }

      const [updated] = await tx
        .update(ledgerEntries)
        .set({ statementLineId: null, reconcileStatus: "unreconciled" })
        .where(eq(ledgerEntries.id, entry.id))
        .returning();

      return updated ?? null;
    });

    if (!result) {
      return sendNotFound(reply);
    }

    return { ledger_entry: serializeLedgerEntry(result) };
  });

  app.post("/ledger/:id/ignore", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [entry] = await db
      .update(ledgerEntries)
      .set({ reconcileStatus: "ignored" })
      .where(eq(ledgerEntries.id, id))
      .returning();

    if (!entry) {
      return sendNotFound(reply);
    }

    return { ledger_entry: serializeLedgerEntry(entry) };
  });
}
