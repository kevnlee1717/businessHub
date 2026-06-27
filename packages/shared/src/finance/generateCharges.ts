import type { ChargeKind, MilestoneBasis } from "../enums";
import { computeDealEconomics, type DealInputs, type SchemeLineInput } from "./dealEconomics";

export type MilestoneInput = {
  seq: number;
  label: string;
  basis: MilestoneBasis;
  value: number;
  collectionItemId?: string | null;
  bindStepOrder?: number | null;
  dueOffsetDays?: number | null;
  note?: string | null;
};

export type ChargeDraft = {
  chargeKind: ChargeKind;
  seq: number;
  label: string;
  period?: string | null;
  dueDate?: string | null;
  caseStepId?: string | null;
  collectionItemId?: string | null;
  schemeLineId?: string | null;
  bindStepOrder?: number | null;
  amountExpected: number;
};

export type GenerateChargesOptions = {
  startPeriod?: string;
};

const DEFAULT_START_PERIOD = "1970-01";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function finiteCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function addMonthsToPeriod(period: string, months: number): string {
  const [yearText, monthText] = period.split("-");
  const yearValue = Number(yearText);
  const monthValue = Number(monthText);

  if (!Number.isInteger(yearValue) || !Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12) {
    return addMonthsToPeriod(DEFAULT_START_PERIOD, months);
  }

  const totalMonths = yearValue * 12 + (monthValue - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function generateCharges(
  lines: SchemeLineInput[],
  milestones: MilestoneInput[],
  inputs: DealInputs,
  opts: GenerateChargesOptions = {}
): ChargeDraft[] {
  const economics = computeDealEconomics(lines, inputs);
  const revenueLines = economics.perLine.filter((line) => line.kind === "revenue");
  const oneTimeRevenueLines = revenueLines.filter((line) => line.recurrence === "one_time");
  const oneTimeTotal = roundMoney(
    oneTimeRevenueLines.reduce((sum, line) => sum + line.amountPerPeriod, 0)
  );
  const charges: ChargeDraft[] = [];
  const sortedMilestones = [...milestones].sort((a, b) => a.seq - b.seq);

  if (sortedMilestones.length > 0) {
    let allocated = 0;

    sortedMilestones.forEach((milestone, index) => {
      const isLast = index === sortedMilestones.length - 1;
      const amount = isLast
        ? roundMoney(oneTimeTotal - allocated)
        : roundMoney(milestone.basis === "percent" ? (oneTimeTotal * milestone.value) / 100 : milestone.value);
      allocated = roundMoney(allocated + amount);

      charges.push({
        chargeKind: "milestone",
        seq: milestone.seq,
        label: milestone.label,
        dueDate: null,
        collectionItemId: milestone.collectionItemId ?? null,
        bindStepOrder: milestone.bindStepOrder ?? null,
        amountExpected: amount
      });
    });
  } else if (oneTimeRevenueLines.length > 0) {
    charges.push({
      chargeKind: "milestone",
      seq: 1,
      label: "全款",
      dueDate: null,
      bindStepOrder: null,
      amountExpected: oneTimeTotal
    });
  }

  const monthlyLines = revenueLines.filter((line) => line.recurrence === "monthly");
  const months = finiteCount(inputs.months);
  const startPeriod = opts.startPeriod ?? DEFAULT_START_PERIOD;
  let periodSeq = 1;

  for (let monthIndex = 0; monthIndex < months; monthIndex += 1) {
    const period = addMonthsToPeriod(startPeriod, monthIndex);

    for (const line of monthlyLines) {
      charges.push({
        chargeKind: "period",
        seq: periodSeq,
        label: period,
        period,
        schemeLineId: line.schemeLineId ?? null,
        amountExpected: roundMoney(line.amountPerPeriod)
      });
      periodSeq += 1;
    }
  }

  const eventLines = revenueLines.filter((line) => line.recurrence === "per_event");
  const events = finiteCount(inputs.events);
  let eventSeq = 1;

  for (const line of eventLines) {
    for (let eventIndex = 0; eventIndex < events; eventIndex += 1) {
      charges.push({
        chargeKind: "event",
        seq: eventSeq,
        label: `第${eventIndex + 1}次`,
        schemeLineId: line.schemeLineId ?? null,
        amountExpected: roundMoney(line.amountPerPeriod)
      });
      eventSeq += 1;
    }
  }

  return charges;
}
