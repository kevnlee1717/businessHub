import { describe, expect, it } from "vitest";

import { generateCharges, type MilestoneInput } from "./generateCharges";
import type { SchemeLineInput } from "./dealEconomics";

describe("generateCharges", () => {
  it("splits one-time revenue by milestones and keeps collection items and bound step orders", () => {
    const charges = generateCharges(
      [
        {
          kind: "revenue",
          basis: "fixed",
          recurrence: "one_time",
          rate: 10000,
          label: "总价"
        }
      ],
      [
        { seq: 1, label: "首付", basis: "percent", value: 30, collectionItemId: "item-down-payment", bindStepOrder: 1 },
        { seq: 2, label: "尾款", basis: "percent", value: 70, bindStepOrder: 8 }
      ],
      {}
    );

    expect(charges).toHaveLength(2);
    expect(charges).toMatchObject([
      {
        chargeKind: "milestone",
        seq: 1,
        label: "首付",
        collectionItemId: "item-down-payment",
        bindStepOrder: 1,
        amountExpected: 3000
      },
      { chargeKind: "milestone", seq: 2, label: "尾款", bindStepOrder: 8, amountExpected: 7000 }
    ]);
  });

  it("puts rounding and percent remainder into the last milestone", () => {
    const milestones: MilestoneInput[] = [
      { seq: 1, label: "第一笔", basis: "percent", value: 33 },
      { seq: 2, label: "第二笔", basis: "percent", value: 33 },
      { seq: 3, label: "尾款", basis: "percent", value: 34 }
    ];

    const charges = generateCharges(
      [
        {
          kind: "revenue",
          basis: "fixed",
          recurrence: "one_time",
          rate: 10000
        }
      ],
      milestones,
      {}
    );

    expect(charges.map((charge) => charge.amountExpected)).toEqual([3300, 3300, 3400]);
    expect(charges.reduce((sum, charge) => sum + charge.amountExpected, 0)).toBe(10000);
  });

  it("generates consecutive monthly period charges from startPeriod", () => {
    const charges = generateCharges(
      [
        {
          kind: "revenue",
          basis: "fixed",
          recurrence: "monthly",
          rate: 500,
          schemeLineId: "line-monthly"
        }
      ],
      [],
      { months: 12 },
      { startPeriod: "2026-06" }
    );

    expect(charges).toHaveLength(12);
    expect(charges.map((charge) => charge.period)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05"
    ]);
    expect(charges[0]).toMatchObject({
      chargeKind: "period",
      label: "2026-06",
      schemeLineId: "line-monthly",
      amountExpected: 500
    });
  });

  it("generates per-event charges by expected events count", () => {
    const lines: SchemeLineInput[] = [
      {
        kind: "revenue",
        basis: "fixed",
        recurrence: "per_event",
        rate: 200,
        schemeLineId: "line-event"
      }
    ];

    const charges = generateCharges(lines, [], { events: 5 });

    expect(charges).toHaveLength(5);
    expect(charges).toMatchObject([
      { chargeKind: "event", seq: 1, label: "第1次", schemeLineId: "line-event", amountExpected: 200 },
      { chargeKind: "event", seq: 2, label: "第2次", schemeLineId: "line-event", amountExpected: 200 },
      { chargeKind: "event", seq: 3, label: "第3次", schemeLineId: "line-event", amountExpected: 200 },
      { chargeKind: "event", seq: 4, label: "第4次", schemeLineId: "line-event", amountExpected: 200 },
      { chargeKind: "event", seq: 5, label: "第5次", schemeLineId: "line-event", amountExpected: 200 }
    ]);
  });

  it("uses a single full-payment milestone when no milestones are configured", () => {
    const charges = generateCharges(
      [
        {
          kind: "revenue",
          basis: "fixed",
          recurrence: "one_time",
          rate: 10000
        }
      ],
      [],
      {}
    );

    expect(charges).toEqual([
      {
        chargeKind: "milestone",
        seq: 1,
        label: "全款",
        dueDate: null,
        bindStepOrder: null,
        amountExpected: 10000
      }
    ]);
  });
});
