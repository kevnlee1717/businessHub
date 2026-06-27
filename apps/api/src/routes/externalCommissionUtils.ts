import {
  billing,
  dealLineAmounts,
  dealParties,
  db,
  externalCommissionEntries
} from "@bh/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DbExecutor } from "./financeUtils";
import { toNumeric } from "./hrUtils";

type BillingRow = typeof billing.$inferSelect;

function inputStartPeriod(inputs: Record<string, unknown> | null | undefined, createdAt: Date): string {
  const raw = inputs?.start_period ?? inputs?.startPeriod;
  if (typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw)) {
    return raw;
  }

  return createdAt.toISOString().slice(0, 7);
}

function addMonths(period: string, offset: number): string {
  const [year = 1970, month = 1] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function roundMoney(value: number): string {
  return value.toFixed(2);
}

export async function refreshExternalCommissionEntries(
  tx: DbExecutor,
  billingRow: BillingRow
): Promise<{ generated: number; deleted_pending: number }> {
  const systemPartyRows = await tx
    .select({ id: dealParties.id })
    .from(dealParties)
    .where(inArray(dealParties.code, ["us", "sales"]));
  const systemPartyIds = new Set(systemPartyRows.map((row) => row.id));

  const lineRows = await tx
    .select()
    .from(dealLineAmounts)
    .where(and(eq(dealLineAmounts.billingId, billingRow.id), eq(dealLineAmounts.kind, "commission")));

  const externalPayees = billingRow.externalPayees ?? {};
  const startPeriod = inputStartPeriod(billingRow.inputs, billingRow.createdAt ?? new Date());
  const retainedRows = await tx
    .select({ sourceLineId: externalCommissionEntries.sourceLineId })
    .from(externalCommissionEntries)
    .where(
      and(
        eq(externalCommissionEntries.billingId, billingRow.id),
        or(
          sql`${externalCommissionEntries.amountSettled} > 0`,
          eq(externalCommissionEntries.status, "settled")
        )
      )
    );
  const retainedSourceLineIds = new Set(
    retainedRows.map((row) => row.sourceLineId).filter((sourceLineId): sourceLineId is string => Boolean(sourceLineId))
  );
  const drafts: Array<typeof externalCommissionEntries.$inferInsert> = [];

  for (const line of lineRows) {
    if (!line.partyId || systemPartyIds.has(line.partyId) || !line.schemeLineId) {
      continue;
    }
    if (retainedSourceLineIds.has(line.schemeLineId)) {
      continue;
    }

    const payeeId = externalPayees[line.schemeLineId];
    if (!payeeId) {
      continue;
    }

    const recurrence = line.recurrence === "monthly" ? "monthly" : "one_time";
    const count = line.recurrence === "monthly" ? Number(line.periodsCount ?? 0) : 1;
    if (count <= 0) {
      continue;
    }

    const amount =
      line.recurrence === "monthly"
        ? Number(line.amountPerPeriod ?? line.amountTotalExpected ?? 0)
        : Number(line.amountTotalExpected ?? line.amountPerPeriod ?? 0);

    for (let index = 0; index < count; index += 1) {
      drafts.push({
        payeeId,
        billingId: billingRow.id,
        businessId: billingRow.businessId,
        partyId: line.partyId,
        period: addMonths(startPeriod, recurrence === "monthly" ? index : 0),
        recurrence,
        seq: index + 1,
        amountSgd: toNumeric(roundMoney(amount)) ?? "0",
        status: "pending",
        sourceLineId: line.schemeLineId
      });
    }
  }

  const deleted = await tx
    .delete(externalCommissionEntries)
    .where(
      and(
        eq(externalCommissionEntries.billingId, billingRow.id),
        eq(externalCommissionEntries.status, "pending"),
        sql`${externalCommissionEntries.amountSettled} = 0`
      )
    )
    .returning({ id: externalCommissionEntries.id });

  if (drafts.length > 0) {
    await tx.insert(externalCommissionEntries).values(drafts);
  }

  return { generated: drafts.length, deleted_pending: deleted.length };
}
