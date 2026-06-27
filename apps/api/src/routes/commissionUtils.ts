import {
  commissionEntries,
  dealLineAmounts,
  dealParties,
  db,
  salesBusinessAssignments,
  type billing
} from "@bh/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { toNumeric } from "./hrUtils";
import type { DbExecutor } from "./financeUtils";

type BillingRow = typeof billing.$inferSelect;
type CommissionDraft = {
  salesId: string;
  billingId: string;
  businessId: string | null;
  period: string;
  recurrence: "one_time" | "monthly";
  seq: number;
  amountSgd: string;
  sourceLineId: string;
  note?: string | null;
};

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

function entryKey(entry: Pick<CommissionDraft, "billingId" | "sourceLineId" | "period" | "seq">): string {
  return `${entry.billingId}:${entry.sourceLineId}:${entry.period}:${entry.seq}`;
}

export async function generateCommissionEntries(
  billingRow: BillingRow,
  tx: DbExecutor = db
): Promise<{ generated: number; deleted_pending: number }> {
  if (!billingRow.salesId) {
    const deleted = await tx
      .delete(commissionEntries)
      .where(and(eq(commissionEntries.billingId, billingRow.id), eq(commissionEntries.status, "pending")))
      .returning({ id: commissionEntries.id });
    return { generated: 0, deleted_pending: deleted.length };
  }

  const salesPartyRows = await tx
    .select({ id: dealParties.id })
    .from(dealParties)
    .where(eq(dealParties.code, "sales"))
    .limit(1);
  const salesPartyId = salesPartyRows[0]?.id;

  if (!salesPartyId) {
    return { generated: 0, deleted_pending: 0 };
  }

  const commissionRows = await tx
    .select()
    .from(dealLineAmounts)
    .where(
      and(
        eq(dealLineAmounts.billingId, billingRow.id),
        eq(dealLineAmounts.kind, "commission"),
        eq(dealLineAmounts.partyId, salesPartyId)
      )
    );

  const revenueRows = await tx
    .select()
    .from(dealLineAmounts)
    .where(and(eq(dealLineAmounts.billingId, billingRow.id), eq(dealLineAmounts.kind, "revenue")));
  const revenueByRecurrence = new Map<string, number>();
  let totalRevenue = 0;
  for (const row of revenueRows) {
    const amount = Number(row.amountPerPeriod ?? row.amountTotalExpected ?? 0);
    const total = row.recurrence === "monthly" ? amount * Number(row.periodsCount ?? 0) : amount;
    totalRevenue += total;
    revenueByRecurrence.set(row.recurrence, (revenueByRecurrence.get(row.recurrence) ?? 0) + total);
  }

  const [assignment] =
    billingRow.businessId === null
      ? []
      : await tx
          .select()
          .from(salesBusinessAssignments)
          .where(
            and(
              eq(salesBusinessAssignments.salesId, billingRow.salesId),
              eq(salesBusinessAssignments.businessId, billingRow.businessId),
              eq(salesBusinessAssignments.active, true)
            )
          )
          .limit(1);

  const startPeriod = inputStartPeriod(billingRow.inputs, billingRow.createdAt ?? new Date());
  const drafts: CommissionDraft[] = [];

  for (const line of commissionRows) {
    const recurrence = line.recurrence === "monthly" ? "monthly" : "one_time";
    const count = line.recurrence === "monthly" ? Number(line.periodsCount ?? 0) : 1;
    if (count <= 0) {
      continue;
    }

    const baseAmount = Number(line.amountPerPeriod ?? 0);
    let amountPerPeriod = baseAmount;
    let note: string | null = null;

    if (assignment?.commissionType && assignment.commissionValue !== null) {
      if (assignment.commissionType === "fixed") {
        amountPerPeriod = Number(assignment.commissionValue);
      } else {
        // Percent override uses matching-recurrence revenue as the base; if unavailable,
        // it falls back to total deal revenue because scheme lines do not encode a direct
        // commission-line to revenue-line relationship.
        const revenueBase = revenueByRecurrence.get(line.recurrence) ?? totalRevenue;
        amountPerPeriod = (revenueBase * Number(assignment.commissionValue)) / 100;
      }
      note = "sales_business_assignment_override";
    }

    for (let index = 0; index < count; index += 1) {
      drafts.push({
        salesId: billingRow.salesId,
        billingId: billingRow.id,
        businessId: billingRow.businessId,
        period: addMonths(startPeriod, recurrence === "monthly" ? index : 0),
        // per_event commission lines are currently materialized as one one_time entry;
        // event-level release can be added when event source data is available.
        recurrence,
        seq: index + 1,
        amountSgd: roundMoney(amountPerPeriod),
        sourceLineId: line.id,
        note
      });
    }
  }

  const existingRows = await tx
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.billingId, billingRow.id));
  const protectedKeys = new Set(
    existingRows
      .filter((entry) => entry.status !== "pending" && entry.sourceLineId)
      .map((entry) =>
        entryKey({
          billingId: entry.billingId,
          sourceLineId: entry.sourceLineId as string,
          period: entry.period,
          seq: entry.seq
        })
      )
  );
  const pendingByKey = new Map(
    existingRows
      .filter((entry) => entry.status === "pending" && entry.sourceLineId)
      .map((entry) => [
        entryKey({
          billingId: entry.billingId,
          sourceLineId: entry.sourceLineId as string,
          period: entry.period,
          seq: entry.seq
        }),
        entry
      ])
  );

  let generated = 0;
  for (const draft of drafts) {
    const key = entryKey(draft);
    if (protectedKeys.has(key)) {
      continue;
    }

    const existing = pendingByKey.get(key);
    const values = {
      salesId: draft.salesId,
      billingId: draft.billingId,
      businessId: draft.businessId,
      period: draft.period,
      recurrence: draft.recurrence,
      seq: draft.seq,
      amountSgd: toNumeric(draft.amountSgd) ?? "0",
      status: "pending" as const,
      payslipId: null,
      sourceLineId: draft.sourceLineId,
      note: draft.note
    };

    if (existing) {
      await tx.update(commissionEntries).set(values).where(eq(commissionEntries.id, existing.id));
      pendingByKey.delete(key);
    } else {
      await tx.insert(commissionEntries).values(values);
      generated += 1;
    }
  }

  let deletedPending = 0;
  for (const stale of pendingByKey.values()) {
    const [deleted] = await tx
      .delete(commissionEntries)
      .where(and(eq(commissionEntries.id, stale.id), ne(commissionEntries.status, "settled")))
      .returning({ id: commissionEntries.id });
    if (deleted) {
      deletedPending += 1;
    }
  }

  return { generated, deleted_pending: deletedPending };
}
