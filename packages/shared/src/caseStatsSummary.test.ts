import { describe, expect, it } from "vitest";
import { computeCaseResultCounts } from "./caseStatsSummary";
import type { IcaStatsCaseInput } from "./icaStats";

describe("computeCaseResultCounts", () => {
  it("counts approved and rejected latest results", () => {
    const cases: IcaStatsCaseInput[] = [
      {
        caseId: "approved",
        submissions: [
          { result: "approved", submittedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }
        ]
      },
      {
        caseId: "rejected",
        submissions: [
          { result: "rejected", submittedAt: "2026-02-01T00:00:00Z", createdAt: "2026-02-01T00:00:00Z" }
        ]
      }
    ];

    expect(computeCaseResultCounts(cases)).toEqual({ approved: 1, pending: 0, rejected: 1 });
  });

  it("counts cases without submissions as pending", () => {
    const cases: IcaStatsCaseInput[] = [{ caseId: "without-submission", submissions: [] }];

    expect(computeCaseResultCounts(cases)).toEqual({ approved: 0, pending: 1, rejected: 0 });
  });

  it("uses the latest submission by createdAt", () => {
    const cases: IcaStatsCaseInput[] = [
      {
        caseId: "latest-approved",
        submissions: [
          { result: "rejected", submittedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
          { result: "approved", submittedAt: "2026-01-02T00:00:00Z", createdAt: "2026-01-03T00:00:00Z" }
        ]
      },
      {
        caseId: "latest-pending",
        submissions: [
          { result: "approved", submittedAt: "2026-02-01T00:00:00Z", createdAt: "2026-02-03T00:00:00Z" },
          { result: "pending", submittedAt: "2026-02-02T00:00:00Z", createdAt: "2026-02-04T00:00:00Z" }
        ]
      }
    ];

    expect(computeCaseResultCounts(cases)).toEqual({ approved: 1, pending: 1, rejected: 0 });
  });
});
