export interface GuarantorCaseInput {
  caseId: string;
  createdAt: string;
  latestResult: "pending" | "approved" | "rejected" | null;
}
export interface GuarantorStats {
  total: number;
  approved: number;
  rejected: number;
  successRate: number | null;
  firstAt: string | null;
  lastAt: string | null;
}
export function computeGuarantorStats(cases: GuarantorCaseInput[]): GuarantorStats {
  const total = cases.length;
  const approved = cases.filter((c) => c.latestResult === "approved").length;
  const rejected = cases.filter((c) => c.latestResult === "rejected").length;
  const decided = approved + rejected;
  const dates = cases.map((c) => c.createdAt).sort();
  return {
    total, approved, rejected,
    successRate: decided === 0 ? null : approved / decided,
    firstAt: dates[0] ?? null,
    lastAt: dates[dates.length - 1] ?? null
  };
}
