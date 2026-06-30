import { describe, it, expect } from "vitest";
import { computeGuarantorSummary } from "./guarantorSummary";

describe("computeGuarantorSummary", () => {
  const perGuarantor = [
    { total: 6, approved: 2, rejected: 3, successRate: 0.4, firstAt: null, lastAt: null },
    { total: 4, approved: 4, rejected: 0, successRate: 1, firstAt: null, lastAt: null }
  ];
  it("担保人数=条目数", () => {
    expect(computeGuarantorSummary(perGuarantor).guarantorCount).toBe(2);
  });
  it("总担保人次=Σtotal", () => {
    expect(computeGuarantorSummary(perGuarantor).sponsoredTotal).toBe(10);
  });
  it("已批准/被拒=Σ", () => {
    const s = computeGuarantorSummary(perGuarantor);
    expect(s.approved).toBe(6);
    expect(s.rejected).toBe(3);
  });
  it("整体成功率=Σ批准/(Σ批准+Σ被拒)", () => {
    expect(computeGuarantorSummary(perGuarantor).successRate).toBeCloseTo(6 / 9);
  });
  it("无判定时成功率为 null", () => {
    expect(computeGuarantorSummary([]).successRate).toBeNull();
  });
});
