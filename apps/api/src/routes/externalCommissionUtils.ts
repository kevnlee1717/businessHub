import {
  billing,
  dealLineAmounts,
  dealParties,
  db,
  externalCommissionEntries,
  schemeLines,
  schemeMilestones
} from "@bh/db";
import { splitCommissionByMilestones } from "@bh/shared";
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

function retainedKey(sourceLineId: string | null | undefined, milestoneSeq: number | null | undefined): string {
  return `${sourceLineId ?? ""}:${milestoneSeq ?? ""}`;
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
  const revenueRows = await tx
    .select()
    .from(dealLineAmounts)
    .where(and(eq(dealLineAmounts.billingId, billingRow.id), eq(dealLineAmounts.kind, "revenue")));
  const oneTimeRevenueTotal = revenueRows
    .filter((line) => line.recurrence === "one_time")
    .reduce((sum, line) => sum + Number(line.amountTotalExpected ?? line.amountPerPeriod ?? 0), 0);

  const milestoneRows = billingRow.schemeVersionId
    ? await tx
        .select()
        .from(schemeMilestones)
        .where(eq(schemeMilestones.versionId, billingRow.schemeVersionId))
        .orderBy(schemeMilestones.seq)
    : [];
  const schemeLineRows = billingRow.schemeVersionId
    ? await tx.select().from(schemeLines).where(eq(schemeLines.versionId, billingRow.schemeVersionId))
    : [];
  const schemeLineById = new Map(schemeLineRows.map((line) => [line.id, line]));
  const milestones = milestoneRows.map((milestone) => ({
    seq: milestone.seq,
    label: milestone.label,
    basis: milestone.basis,
    value: Number(milestone.value)
  }));

  const externalPayees = billingRow.externalPayees ?? {};
  const startPeriod = inputStartPeriod(billingRow.inputs, billingRow.createdAt ?? new Date());
  const retainedRows = await tx
    .select({
      sourceLineId: externalCommissionEntries.sourceLineId,
      milestoneSeq: externalCommissionEntries.milestoneSeq
    })
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
  const retainedKeys = new Set(retainedRows.map((row) => retainedKey(row.sourceLineId, row.milestoneSeq)));
  const drafts: Array<typeof externalCommissionEntries.$inferInsert> = [];

  for (const line of lineRows) {
    if (!line.partyId || systemPartyIds.has(line.partyId)) {
      continue;
    }

    const sourceKey = line.schemeLineId ?? line.id;
    const payeeId = externalPayees[sourceKey];
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
    const schemeLine = line.schemeLineId ? schemeLineById.get(line.schemeLineId) : undefined;

    if (recurrence === "one_time") {
      const splits = splitCommissionByMilestones({
        commissionTotal: amount,
        revenueTotal: oneTimeRevenueTotal,
        milestones,
        milestoneSplit: schemeLine?.milestoneSplit ?? null
      });

      for (const split of splits) {
        if (retainedKeys.has(retainedKey(sourceKey, split.milestoneSeq))) {
          continue;
        }

        const lineLabel = line.label ?? schemeLine?.label ?? "Commission";
        drafts.push({
          payeeId,
          billingId: billingRow.id,
          businessId: billingRow.businessId,
          partyId: line.partyId,
          period: addMonths(startPeriod, 0),
          recurrence,
          seq: 1,
          milestoneSeq: split.milestoneSeq,
          amountSgd: toNumeric(roundMoney(split.amount)) ?? "0",
          status: "pending",
          sourceLineId: sourceKey,
          note: split.label ? `${lineLabel} · ${split.label}` : lineLabel
        });
      }
      continue;
    }

    for (let index = 0; index < count; index += 1) {
      if (retainedKeys.has(retainedKey(sourceKey, null))) {
        continue;
      }

      drafts.push({
        payeeId,
        billingId: billingRow.id,
        businessId: billingRow.businessId,
        partyId: line.partyId,
        period: addMonths(startPeriod, recurrence === "monthly" ? index : 0),
        recurrence,
        seq: index + 1,
        milestoneSeq: null,
        amountSgd: toNumeric(roundMoney(amount)) ?? "0",
        status: "pending",
        sourceLineId: sourceKey
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
