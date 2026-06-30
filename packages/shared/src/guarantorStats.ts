import type { SubmissionResult } from "./icaImport";
export type { SubmissionResult };

/** 一个案件的若干轮提交里,取最新一轮的 result(无提交返回 null) */
export function latestSubmissionResult(
  submissions: { result: SubmissionResult; submittedAt: string | null; createdAt: string }[]
): SubmissionResult | null {
  if (submissions.length === 0) {
    return null;
  }
  const sorted = [...submissions].sort((a, b) => {
    const sa = a.submittedAt ?? a.createdAt;
    const sb = b.submittedAt ?? b.createdAt;
    if (sa !== sb) {
      return sb.localeCompare(sa);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
  return sorted[0]!.result;
}

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
