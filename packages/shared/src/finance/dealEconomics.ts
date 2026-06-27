import type { SchemeLineBasis, SchemeLineKind, SchemeLineRecurrence } from "../enums";

export type SchemeLineInput = {
  kind: SchemeLineKind;
  basis: SchemeLineBasis;
  recurrence: SchemeLineRecurrence;
  rate?: number | null;
  unitLabel?: string | null;
  inputKey?: string | null;
  label?: string | null;
  partyId?: string | null;
  partyCode?: string | null;
  schemeLineId?: string | null;
  milestoneSplit?: Record<string, number> | null;
};

export type DealInputs = Record<string, number>;

export type ComputedDealLine = {
  schemeLineId?: string | null;
  kind: SchemeLineKind;
  recurrence: SchemeLineRecurrence;
  partyId?: string | null;
  label?: string | null;
  amountPerPeriod: number;
  periodsCount: number | null;
  amountTotalExpected: number | null;
};

export type RecurrenceTotals = {
  revenue: number;
  cost: number;
  commission: number;
  profit: number;
};

export type DealEconomicsResult = {
  perLine: ComputedDealLine[];
  totals: {
    perRecurrence: Record<SchemeLineRecurrence, RecurrenceTotals>;
    expected: RecurrenceTotals;
    profit: number;
    profitRate: number;
    hasOpenEnded: boolean;
  };
};

const RECURRENCES: SchemeLineRecurrence[] = ["one_time", "monthly", "per_event"];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function finiteInput(inputs: DealInputs, key: string): number | null {
  const value = inputs[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inputOrZero(inputs: DealInputs, key: string | null | undefined): number {
  if (!key) {
    return 0;
  }

  return finiteInput(inputs, key) ?? 0;
}

function getPeriodsCount(recurrence: SchemeLineRecurrence, inputs: DealInputs): number | null {
  if (recurrence === "one_time") {
    return 1;
  }

  return recurrence === "monthly" ? finiteInput(inputs, "months") : finiteInput(inputs, "events");
}

function computeBaseAmount(line: SchemeLineInput, inputs: DealInputs): number {
  const rate = Number.isFinite(line.rate) ? (line.rate ?? 0) : 0;

  switch (line.basis) {
    case "fixed":
      if (line.inputKey) {
        const inputValue = finiteInput(inputs, line.inputKey);
        if (inputValue !== null) {
          return inputValue;
        }
      }

      return rate;
    case "per_unit":
      return rate * inputOrZero(inputs, line.inputKey);
    case "margin": {
      const key = line.inputKey;
      if (!key) {
        return 0;
      }

      return inputOrZero(inputs, `${key}_sell`) - inputOrZero(inputs, `${key}_cost`);
    }
    case "percent_of_revenue":
      return 0;
  }
}

function addAmount(totals: RecurrenceTotals, kind: SchemeLineKind, amount: number): void {
  totals[kind] = roundMoney(totals[kind] + amount);
  totals.profit = roundMoney(totals.revenue - totals.cost - totals.commission);
}

function emptyTotals(): RecurrenceTotals {
  return {
    revenue: 0,
    cost: 0,
    commission: 0,
    profit: 0
  };
}

export function computeDealEconomics(
  lines: SchemeLineInput[],
  inputs: DealInputs
): DealEconomicsResult {
  const revenueBaseByRecurrence: Record<SchemeLineRecurrence, number> = {
    one_time: 0,
    monthly: 0,
    per_event: 0
  };

  const amounts = lines.map((line) => {
    if (line.basis === "percent_of_revenue") {
      return 0;
    }

    const amount = roundMoney(computeBaseAmount(line, inputs));
    if (line.kind === "revenue") {
      revenueBaseByRecurrence[line.recurrence] = roundMoney(
        revenueBaseByRecurrence[line.recurrence] + amount
      );
    }

    return amount;
  });

  lines.forEach((line, index) => {
    if (line.basis !== "percent_of_revenue") {
      return;
    }

    const rate = Number.isFinite(line.rate) ? (line.rate ?? 0) : 0;
    amounts[index] = roundMoney((rate / 100) * revenueBaseByRecurrence[line.recurrence]);
  });

  const perLine = lines.map((line, index): ComputedDealLine => {
    const amountPerPeriod = amounts[index] ?? 0;
    const periodsCount = getPeriodsCount(line.recurrence, inputs);
    const amountTotalExpected =
      periodsCount === null ? null : roundMoney(amountPerPeriod * periodsCount);
    const computedLine: ComputedDealLine = {
      kind: line.kind,
      recurrence: line.recurrence,
      amountPerPeriod,
      periodsCount,
      amountTotalExpected
    };

    if (line.schemeLineId !== undefined) {
      computedLine.schemeLineId = line.schemeLineId;
    }
    if (line.partyId !== undefined) {
      computedLine.partyId = line.partyId;
    }
    if (line.label !== undefined) {
      computedLine.label = line.label;
    }

    return computedLine;
  });

  const perRecurrence: Record<SchemeLineRecurrence, RecurrenceTotals> = {
    one_time: emptyTotals(),
    monthly: emptyTotals(),
    per_event: emptyTotals()
  };
  const expected = emptyTotals();
  let hasOpenEnded = false;

  perLine.forEach((line) => {
    addAmount(perRecurrence[line.recurrence], line.kind, line.amountPerPeriod);

    if (line.periodsCount === null) {
      hasOpenEnded = true;
      return;
    }

    addAmount(expected, line.kind, line.amountTotalExpected ?? 0);
  });

  for (const recurrence of RECURRENCES) {
    perRecurrence[recurrence].profit = roundMoney(
      perRecurrence[recurrence].revenue -
        perRecurrence[recurrence].cost -
        perRecurrence[recurrence].commission
    );
  }
  expected.profit = roundMoney(expected.revenue - expected.cost - expected.commission);

  return {
    perLine,
    totals: {
      perRecurrence,
      expected,
      profit: expected.profit,
      profitRate: expected.revenue > 0 ? roundRate(expected.profit / expected.revenue) : 0,
      hasOpenEnded
    }
  };
}
