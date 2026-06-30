import { describe, it, expect } from "vitest";
import { computeGuarantorStats } from "./guarantorStats";

describe("computeGuarantorStats", () => {
  const cases = [
    { caseId: "c1", createdAt: "2026-01-01T00:00:00Z", latestResult: "approved" as const },
    { caseId: "c2", createdAt: "2026-03-01T00:00:00Z", latestResult: "rejected" as const },
    { caseId: "c3", createdAt: "2026-05-01T00:00:00Z", latestResult: "pending" as const }
  ];
  it("案件数=全部", () => { expect(computeGuarantorStats(cases).total).toBe(3); });
  it("成功率=通过/(通过+拒绝)，pending 不计", () => {
    expect(computeGuarantorStats(cases).successRate).toBeCloseTo(0.5);
  });
  it("担保时间取最早/最近 createdAt", () => {
    const s = computeGuarantorStats(cases);
    expect(s.firstAt).toBe("2026-01-01T00:00:00Z");
    expect(s.lastAt).toBe("2026-05-01T00:00:00Z");
  });
  it("无可判定(全 pending) successRate 为 null", () => {
    expect(computeGuarantorStats([{ caseId: "x", createdAt: "2026-01-01T00:00:00Z", latestResult: "pending" }]).successRate).toBeNull();
  });
  it("空 → total 0, successRate null", () => {
    const s = computeGuarantorStats([]);
    expect(s.total).toBe(0); expect(s.successRate).toBeNull(); expect(s.firstAt).toBeNull();
  });
});
