import { describe, expect, it } from "vitest";
import { splitCommissionByMilestones, type MilestoneStage } from "./splitCommissionByMilestones";

describe("splitCommissionByMilestones", () => {
  it("returns the full commission when there are no milestones", () => {
    expect(
      splitCommissionByMilestones({
        commissionTotal: 123.456,
        revenueTotal: 1000,
        milestones: []
      })
    ).toEqual([{ milestoneSeq: null, label: null, amount: 123.46 }]);
  });

  it("uses revenue percent milestones as the default allocation", () => {
    const milestones: MilestoneStage[] = [
      { seq: 1, label: "首付", basis: "percent", value: 30 },
      { seq: 2, label: "尾款", basis: "percent", value: 70 }
    ];

    expect(
      splitCommissionByMilestones({
        commissionTotal: 1000,
        revenueTotal: 10000,
        milestones
      })
    ).toEqual([
      { milestoneSeq: 1, label: "首付", amount: 300 },
      { milestoneSeq: 2, label: "尾款", amount: 700 }
    ]);
  });

  it("honors explicit split values including zero", () => {
    const milestones: MilestoneStage[] = [
      { seq: 1, label: "首付", basis: "percent", value: 30 },
      { seq: 2, label: "尾款", basis: "percent", value: 70 }
    ];

    expect(
      splitCommissionByMilestones({
        commissionTotal: 1000,
        revenueTotal: 10000,
        milestones,
        milestoneSplit: { "1": 0, "2": 100 }
      })
    ).toEqual([
      { milestoneSeq: 1, label: "首付", amount: 0 },
      { milestoneSeq: 2, label: "尾款", amount: 1000 }
    ]);
  });

  it("uses fixed milestone revenue as the default allocation base", () => {
    const milestones: MilestoneStage[] = [
      { seq: 1, label: "订金", basis: "fixed", value: 2000 },
      { seq: 2, label: "尾款", basis: "fixed", value: 8000 }
    ];

    expect(
      splitCommissionByMilestones({
        commissionTotal: 500,
        revenueTotal: 10000,
        milestones
      })
    ).toEqual([
      { milestoneSeq: 1, label: "订金", amount: 100 },
      { milestoneSeq: 2, label: "尾款", amount: 400 }
    ]);
  });

  it("puts rounding drift into the last milestone", () => {
    const milestones: MilestoneStage[] = [
      { seq: 1, label: "一期", basis: "percent", value: 33 },
      { seq: 2, label: "二期", basis: "percent", value: 33 },
      { seq: 3, label: "三期", basis: "percent", value: 34 }
    ];

    const result = splitCommissionByMilestones({
      commissionTotal: 1000,
      revenueTotal: 100,
      milestones
    });

    expect(result).toEqual([
      { milestoneSeq: 1, label: "一期", amount: 330 },
      { milestoneSeq: 2, label: "二期", amount: 330 },
      { milestoneSeq: 3, label: "三期", amount: 340 }
    ]);
    expect(result.reduce((sum, row) => sum + row.amount, 0)).toBe(1000);
  });
});
