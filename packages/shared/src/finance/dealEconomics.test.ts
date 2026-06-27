import { describe, expect, it } from "vitest";

import { computeDealEconomics, type SchemeLineInput } from "./dealEconomics";

describe("computeDealEconomics", () => {
  it("computes one-time sale revenue, commission, profit, and profit rate", () => {
    const lines: SchemeLineInput[] = [
      {
        kind: "revenue",
        basis: "fixed",
        recurrence: "one_time",
        rate: 5000,
        label: "总价"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "one_time",
        rate: 10,
        label: "业务员提成"
      }
    ];

    const result = computeDealEconomics(lines, {});

    expect(result.totals.expected).toEqual({
      revenue: 5000,
      cost: 0,
      commission: 500,
      profit: 4500
    });
    expect(result.totals.profit).toBe(4500);
    expect(result.totals.profitRate).toBe(0.9);
    expect(result.totals.hasOpenEnded).toBe(false);
  });

  it("uses fixed inputKey value when present and falls back to rate when missing", () => {
    const lines: SchemeLineInput[] = [
      {
        kind: "revenue",
        basis: "fixed",
        recurrence: "one_time",
        rate: 5000,
        inputKey: "price",
        label: "总价"
      }
    ];

    expect(computeDealEconomics(lines, { price: 8000 }).perLine[0]?.amountPerPeriod).toBe(8000);
    expect(computeDealEconomics(lines, {}).perLine[0]?.amountPerPeriod).toBe(5000);
  });

  it("computes monthly margin with expected totals", () => {
    const lines: SchemeLineInput[] = [
      {
        kind: "revenue",
        basis: "margin",
        recurrence: "monthly",
        inputKey: "unit",
        label: "月度差价"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "monthly",
        rate: 10,
        label: "业务员提成"
      }
    ];

    const result = computeDealEconomics(lines, { months: 12, unit_sell: 800, unit_cost: 500 });

    expect(result.totals.perRecurrence.monthly).toEqual({
      revenue: 300,
      cost: 0,
      commission: 30,
      profit: 270
    });
    expect(result.totals.expected.profit).toBe(3240);
  });

  it("computes per-unit per-event revenue by expected event count", () => {
    const lines: SchemeLineInput[] = [
      {
        kind: "revenue",
        basis: "per_unit",
        recurrence: "per_event",
        rate: 20,
        inputKey: "nights",
        unitLabel: "晚",
        label: "每晚抽成"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "per_event",
        rate: 10,
        label: "业务员提成"
      }
    ];

    const result = computeDealEconomics(lines, { events: 30, nights: 1 });

    expect(result.perLine[0]).toMatchObject({
      amountPerPeriod: 20,
      periodsCount: 30,
      amountTotalExpected: 600
    });
    expect(result.totals.expected).toEqual({
      revenue: 600,
      cost: 0,
      commission: 60,
      profit: 540
    });
  });

  it("computes per-head multi-party monthly economics", () => {
    const lines: SchemeLineInput[] = [
      {
        kind: "revenue",
        basis: "per_unit",
        recurrence: "monthly",
        rate: 300,
        inputKey: "headcount",
        label: "客户人头费"
      },
      {
        kind: "revenue",
        basis: "per_unit",
        recurrence: "monthly",
        rate: 50,
        inputKey: "headcount",
        partyCode: "hr_source",
        label: "HR 返点"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "monthly",
        rate: 10,
        partyCode: "sales",
        label: "sales 提成"
      },
      {
        kind: "cost",
        basis: "fixed",
        recurrence: "monthly",
        rate: 200,
        label: "办公分摊"
      }
    ];

    const result = computeDealEconomics(lines, { headcount: 10, months: 12 });

    expect(result.totals.perRecurrence.monthly).toEqual({
      revenue: 3500,
      cost: 200,
      commission: 350,
      profit: 2950
    });
    expect(result.totals.expected.profit).toBe(35400);
  });

  it("uses two-pass percent_of_revenue over combined revenue in the same recurrence", () => {
    const lines: SchemeLineInput[] = [
      {
        kind: "revenue",
        basis: "fixed",
        recurrence: "one_time",
        rate: 1000,
        label: "基础收入"
      },
      {
        kind: "revenue",
        basis: "per_unit",
        recurrence: "one_time",
        rate: 200,
        inputKey: "units",
        label: "数量收入"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "one_time",
        rate: 10,
        label: "业务员提成"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "monthly",
        rate: 10,
        label: "月度提成"
      }
    ];

    const result = computeDealEconomics(lines, { units: 3, months: 12 });

    expect(result.perLine[2]?.amountPerPeriod).toBe(160);
    expect(result.perLine[3]?.amountPerPeriod).toBe(0);
    expect(result.totals.expected.commission).toBe(160);
  });

  it("keeps negative margin and defaults missing margin fields to zero", () => {
    const result = computeDealEconomics(
      [
        {
          kind: "revenue",
          basis: "margin",
          recurrence: "one_time",
          inputKey: "loss_unit",
          label: "亏损差价"
        },
        {
          kind: "revenue",
          basis: "margin",
          recurrence: "one_time",
          inputKey: "missing_unit",
          label: "缺字段差价"
        }
      ],
      { loss_unit_sell: 100, loss_unit_cost: 150 }
    );

    expect(result.perLine[0]?.amountPerPeriod).toBe(-50);
    expect(result.perLine[1]?.amountPerPeriod).toBe(0);
    expect(result.totals.expected.revenue).toBe(-50);
  });
});
