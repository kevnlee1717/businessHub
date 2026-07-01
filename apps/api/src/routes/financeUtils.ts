import {
  billing,
  businesses,
  caseCommissions,
  cases,
  dealLineAmounts,
  dealParties,
  db,
  packageCommissions,
  schemeLines,
  servicePackages,
  type schemeVersions
} from "@bh/db";
import { computeDealEconomics, type DealInputs, type MilestoneSplit, type SchemeLineInput } from "@bh/shared";
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
  milestoneSplit?: MilestoneSplit | null | undefined;
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
    milestone_split: row.milestoneSplit ?? null,
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
    milestoneSplit: line.milestoneSplit ?? null,
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
    milestoneSplit: line.milestoneSplit,
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

type PackageCommissionRule = {
  partyId: string | null;
  externalPartyId: string | null;
  basis: "percent" | "fixed";
  value: string;
};

function computePackageCommissionAmount(basePrice: number, rule: PackageCommissionRule | undefined): number {
  if (!rule) {
    return 0;
  }

  const value = Number(rule.value);
  if (!Number.isFinite(value)) {
    return 0;
  }

  return rule.basis === "percent" ? (basePrice * value) / 100 : value;
}

export async function refreshPackageDealLineAmounts(
  billingId: string,
  tx: DbExecutor = db
): Promise<(typeof billing.$inferSelect) | null> {
  const [billingRow] = await tx.select().from(billing).where(eq(billing.id, billingId)).limit(1);

  if (!billingRow || billingRow.refType !== "ep") {
    return null;
  }

  const [caseRow] = await tx.select().from(cases).where(eq(cases.id, billingRow.refId)).limit(1);

  if (!caseRow?.packageId) {
    return billingRow;
  }

  const [servicePackage] = await tx
    .select()
    .from(servicePackages)
    .where(eq(servicePackages.id, caseRow.packageId))
    .limit(1);

  if (!servicePackage) {
    return billingRow;
  }

  const [businessRow] = await tx
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.code, caseRow.businessType))
    .limit(1);
  const businessId = businessRow?.id ?? billingRow.businessId;
  let nextBillingRow = billingRow;

  if (businessId && billingRow.businessId !== businessId) {
    const [updated] = await tx
      .update(billing)
      .set({ businessId, updatedAt: new Date() })
      .where(eq(billing.id, billingId))
      .returning();
    nextBillingRow = updated ?? billingRow;
  }

  const caseRuleRows = await tx.select().from(caseCommissions).where(eq(caseCommissions.caseId, caseRow.id));
  const packageRuleRows = await tx
    .select()
    .from(packageCommissions)
    .where(eq(packageCommissions.packageId, caseRow.packageId));
  const caseRuleByTarget = new Map(
    caseRuleRows.map((rule) => [
      rule.target,
      {
        partyId: rule.partyId,
        externalPartyId: rule.externalPartyId,
        basis: rule.basis,
        value: rule.value
      }
    ])
  );
  const packageRuleByTarget = new Map(
    packageRuleRows.map((rule) => [
      rule.target,
      {
        partyId: rule.defaultPartyId,
        externalPartyId: null,
        basis: rule.basis,
        value: rule.value
      }
    ])
  );
  const ruleForTarget = (target: "internal_sales" | "external_channel") =>
    caseRuleByTarget.get(target) ?? packageRuleByTarget.get(target);

  const basePrice = Number(servicePackage.basePriceSgd);
  const packagePrice = toNumeric(servicePackage.basePriceSgd) ?? "0";
  const internalRule = ruleForTarget("internal_sales");
  const externalRule = ruleForTarget("external_channel");
  const internalAmount = computePackageCommissionAmount(basePrice, internalRule);
  const externalAmount = computePackageCommissionAmount(basePrice, externalRule);

  await tx.delete(dealLineAmounts).where(eq(dealLineAmounts.billingId, billingId));

  await tx.insert(dealLineAmounts).values({
    billingId,
    schemeLineId: null,
    kind: "revenue",
    recurrence: "one_time",
    partyId: null,
    label: servicePackage.name,
    amountPerPeriod: packagePrice,
    periodsCount: 1,
    amountTotalExpected: packagePrice
  });

  if (internalRule && internalAmount > 0) {
    const [salesParty] = await tx
      .select({ id: dealParties.id })
      .from(dealParties)
      .where(eq(dealParties.code, "sales"))
      .limit(1);

    if (salesParty) {
      await tx.insert(dealLineAmounts).values({
        billingId,
        schemeLineId: null,
        kind: "commission",
        recurrence: "one_time",
        partyId: salesParty.id,
        label: "Internal sales commission",
        amountPerPeriod: toNumeric(internalAmount) ?? "0",
        periodsCount: 1,
        amountTotalExpected: toNumeric(internalAmount) ?? "0"
      });
    }
  }

  if (externalRule && externalAmount > 0 && externalRule.partyId) {
    const [externalLine] = await tx
      .insert(dealLineAmounts)
      .values({
        billingId,
        schemeLineId: null,
        kind: "commission",
        recurrence: "one_time",
        partyId: externalRule.partyId,
        label: "External channel commission",
        amountPerPeriod: toNumeric(externalAmount) ?? "0",
        periodsCount: 1,
        amountTotalExpected: toNumeric(externalAmount) ?? "0"
      })
      .returning({ id: dealLineAmounts.id });

    if (externalLine && externalRule.externalPartyId) {
      const externalPayees = {
        ...(nextBillingRow.externalPayees ?? {}),
        [externalLine.id]: externalRule.externalPartyId
      };
      const [updated] = await tx
        .update(billing)
        .set({ externalPayees, updatedAt: new Date() })
        .where(eq(billing.id, billingId))
        .returning();
      nextBillingRow = updated ?? { ...nextBillingRow, externalPayees };
    }
  }

  return nextBillingRow;
}
