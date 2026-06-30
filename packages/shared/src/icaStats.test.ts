import { describe, it, expect } from "vitest";
import { computeIcaStats, type IcaStatsCaseInput } from "./icaStats";

describe("computeIcaStats", () => {
  it("空输入返回全零", () => {
    const result = computeIcaStats([]);
    expect(result.summary).toEqual({ totalClients: 0, approved: 0, rejected: 0, pending: 0 });
    expect(result.years).toEqual([]);
  });

  it("单案件单提交 approved", () => {
    const cases: IcaStatsCaseInput[] = [
      {
        caseId: "1",
        submissions: [
          { result: "approved", submittedAt: "2025-03-01T00:00:00Z", createdAt: "2025-03-01T00:00:00Z" }
        ]
      }
    ];
    const result = computeIcaStats(cases);
    expect(result.summary).toEqual({ totalClients: 1, approved: 1, rejected: 0, pending: 0 });
    expect(result.years).toHaveLength(1);
    expect(result.years[0]!.year).toBe(2025);
    expect(result.years[0]!.months[2]!.count).toBe(1); // 3月(index 2)
    expect(result.years[0]!.months[0]!.count).toBe(0); // 1月=0
    expect(result.years[0]!.total).toBe(1);
  });

  it("多轮申诉取最新结果(submittedAt desc)", () => {
    const cases: IcaStatsCaseInput[] = [
      {
        caseId: "1",
        submissions: [
          { result: "rejected", submittedAt: "2025-01-01T00:00:00Z", createdAt: "2025-01-01T00:00:00Z" },
          { result: "approved", submittedAt: "2025-06-01T00:00:00Z", createdAt: "2025-06-01T00:00:00Z" }
        ]
      }
    ];
    const result = computeIcaStats(cases);
    expect(result.summary.approved).toBe(1);
    expect(result.summary.rejected).toBe(0);
    // 首次申诉月 = 2025-01
    expect(result.years[0]!.months[0]!.count).toBe(1);
  });

  it("首次申诉月用最早 submittedAt 归类", () => {
    const cases: IcaStatsCaseInput[] = [
      {
        caseId: "1",
        submissions: [
          { result: "pending", submittedAt: "2025-07-01T00:00:00Z", createdAt: "2025-07-01T00:00:00Z" },
          { result: "rejected", submittedAt: "2025-03-01T00:00:00Z", createdAt: "2025-03-01T00:00:00Z" }
        ]
      }
    ];
    const result = computeIcaStats(cases);
    // 首次月=3月, 最新结果=pending (7月 submittedAt 更新)
    expect(result.summary.pending).toBe(1);
    expect(result.years[0]!.months[2]!.count).toBe(1); // Mar
    expect(result.years[0]!.months[6]!.count).toBe(0); // Jul
  });

  it("无提交的案件记为 pending 且不计入柱状图", () => {
    const cases: IcaStatsCaseInput[] = [{ caseId: "1", submissions: [] }];
    const result = computeIcaStats(cases);
    expect(result.summary.pending).toBe(1);
    expect(result.years).toEqual([]);
  });

  it("跨 2025/2026 两年分布，years 按年份倒序", () => {
    const cases: IcaStatsCaseInput[] = [
      {
        caseId: "1",
        submissions: [
          { result: "pending", submittedAt: "2025-05-01T00:00:00Z", createdAt: "2025-05-01T00:00:00Z" }
        ]
      },
      {
        caseId: "2",
        submissions: [
          { result: "approved", submittedAt: "2026-02-01T00:00:00Z", createdAt: "2026-02-01T00:00:00Z" }
        ]
      }
    ];
    const result = computeIcaStats(cases);
    expect(result.years).toHaveLength(2);
    expect(result.years[0]!.year).toBe(2026);
    expect(result.years[1]!.year).toBe(2025);
    expect(result.years[0]!.months[1]!.count).toBe(1); // Feb 2026
    expect(result.years[1]!.months[4]!.count).toBe(1); // May 2025
  });

  it("months 数组始终长度 12，缺月 count=0", () => {
    const cases: IcaStatsCaseInput[] = [
      {
        caseId: "1",
        submissions: [
          { result: "pending", submittedAt: "2025-12-01T00:00:00Z", createdAt: "2025-12-01T00:00:00Z" }
        ]
      }
    ];
    const result = computeIcaStats(cases);
    expect(result.years[0]!.months).toHaveLength(12);
    expect(result.years[0]!.months[11]!.count).toBe(1); // Dec
    for (let i = 0; i < 11; i++) {
      expect(result.years[0]!.months[i]!.count).toBe(0);
    }
  });

  it("total = 年内各月 count 之和", () => {
    const cases: IcaStatsCaseInput[] = [
      {
        caseId: "1",
        submissions: [{ result: "pending", submittedAt: "2025-01-01T00:00:00Z", createdAt: "2025-01-01T00:00:00Z" }]
      },
      {
        caseId: "2",
        submissions: [{ result: "approved", submittedAt: "2025-03-01T00:00:00Z", createdAt: "2025-03-01T00:00:00Z" }]
      },
      {
        caseId: "3",
        submissions: [{ result: "rejected", submittedAt: "2025-03-15T00:00:00Z", createdAt: "2025-03-15T00:00:00Z" }]
      }
    ];
    const result = computeIcaStats(cases);
    expect(result.years[0]!.total).toBe(3);
    expect(result.years[0]!.months[0]!.count).toBe(1); // Jan
    expect(result.years[0]!.months[2]!.count).toBe(2); // Mar(2个)
  });
});
