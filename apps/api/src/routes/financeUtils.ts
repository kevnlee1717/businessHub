import {
  dealLineAmounts,
  dealParties,
  db,
  schemeLines,
  type schemeVersions
} from "@bh/db";
import { computeDealEconomics, type DealInputs, type SchemeLineInput } from "@bh/shared";
import { eq, inArray } from "drizzle-orm";
import { toNumeric } from "./hrUtils";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTransaction;
type SchemeLineRow = typeof schemeLines.$inferSelect;
type SchemeVersionRow = typeof schemeVersions.$inferSelect;
export type ResolvableSchemeLineInput = {
  kind: SchemeLineInput["kind"];
  basis: SchemeLineInput["basis"];
  recurrence: SchemeLineInput["recurrence"];
  rate?: number | null | undefined;
  unitLabel?: string | null | undefined;
  inputKey?: string | null | undefined;
  label?: string | null | undefined;
  partyId?: string | null | undefined;
  partyCode?: string | null | undefined;
  sortOrder?: number | undefined;
  note?: string | null | undefined;
};

export function serializeDealEconomics(result: ReturnType<typeof computeDealEconomics>) {
  return {
    per_line: result.perLine.map((line) => ({
      scheme_line_id: line.schemeLineId,
      kind: line.kind,
      recurrence: line.recurrence,
      party_id: line.partyId,
      label: line.label,
      amount_per_period: line.amountPerPeriod.toFixed(2),
      periods_count: line.periodsCount,
      amount_total_expected: line.amountTotalExpected?.toFixed(2) ?? null
    })),
    totals: {
      per_recurrence: result.totals.perRecurrence,
      expected: result.totals.expected,
      profit: result.totals.profit,
      profit_rate: result.totals.profitRate,
      has_open_ended: result.totals.hasOpenEnded
    }
  };
}

export function serializeSchemeLine(row: SchemeLineRow) {
  return {
    id: row.id,
    version_id: row.versionId,
    sort_order: row.sortOrder,
    kind: row.kind,
    basis: row.basis,
    recurrence: row.recurrence,
    party_id: row.partyId,
    rate: row.rate,
    unit_label: row.unitLabel,
    input_key: row.inputKey,
    label: row.label,
    note: row.note,
    created_at: row.createdAt
  };
}

export function toEngineLines(rows: SchemeLineRow[]): SchemeLineInput[] {
  return rows.map((line) => ({
    schemeLineId: line.id,
    kind: line.kind,
    basis: line.basis,
    recurrence: line.recurrence,
    partyId: line.partyId,
    rate: line.rate === null ? null : Number(line.rate),
    unitLabel: line.unitLabel,
    inputKey: line.inputKey,
    label: line.label
  }));
}

export async function resolvePartyIds(
  inputLines: ResolvableSchemeLineInput[],
  tx: DbExecutor = db
) {
  const partyCodes = Array.from(
    new Set(inputLines.map((line) => line.partyCode).filter((code): code is string => Boolean(code)))
  );
  const codeToId = new Map<string, string>();

  if (partyCodes.length > 0) {
    const rows = await tx.select().from(dealParties).where(inArray(dealParties.code, partyCodes));
    rows.forEach((row) => codeToId.set(row.code, row.id));
  }

  return inputLines.map((line) => ({
    kind: line.kind,
    basis: line.basis,
    recurrence: line.recurrence,
    partyId: line.partyId ?? (line.partyCode ? codeToId.get(line.partyCode) ?? null : null),
    rate: line.rate,
    unitLabel: line.unitLabel,
    inputKey: line.inputKey,
    label: line.label,
    note: line.note,
    sortOrder: line.sortOrder
  }));
}

export async function calculateVersionEconomics(
  versionId: string,
  inputs: DealInputs,
  tx: DbExecutor = db
) {
  const rows = await tx
    .select()
    .from(schemeLines)
    .where(eq(schemeLines.versionId, versionId))
    .orderBy(schemeLines.sortOrder, schemeLines.createdAt);

  return computeDealEconomics(toEngineLines(rows), inputs);
}

export async function recalculateVersionProfitRate(
  version: Pick<SchemeVersionRow, "id" | "assumedInputs">,
  tx: DbExecutor = db
) {
  const inputs = (version.assumedInputs ?? {}) as DealInputs;
  const result = await calculateVersionEconomics(version.id, inputs, tx);

  return result.totals.profitRate;
}

export async function refreshBillingDealLineAmounts(
  billingId: string,
  schemeVersionId: string,
  inputs: DealInputs,
  tx: DbExecutor = db
) {
  const result = await calculateVersionEconomics(schemeVersionId, inputs, tx);

  await tx.delete(dealLineAmounts).where(eq(dealLineAmounts.billingId, billingId));

  if (result.perLine.length > 0) {
    await tx.insert(dealLineAmounts).values(
      result.perLine.map((line) => ({
        billingId,
        schemeLineId: line.schemeLineId,
        kind: line.kind,
        recurrence: line.recurrence,
        partyId: line.partyId,
        label: line.label,
        amountPerPeriod: toNumeric(line.amountPerPeriod) ?? "0",
        periodsCount: line.periodsCount,
        amountTotalExpected:
          line.amountTotalExpected === null ? null : toNumeric(line.amountTotalExpected) ?? "0"
      }))
    );
  }

  return result;
}
