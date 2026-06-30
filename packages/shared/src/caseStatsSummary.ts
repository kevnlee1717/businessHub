import type { IcaStatsCaseInput } from "./icaStats";

export interface CaseResultCounts {
  approved: number;
  pending: number;
  rejected: number;
}

export function computeCaseResultCounts(cases: IcaStatsCaseInput[]): CaseResultCounts {
  const counts: CaseResultCounts = {
    approved: 0,
    pending: 0,
    rejected: 0
  };

  for (const c of cases) {
    if (c.submissions.length === 0) {
      counts.pending++;
      continue;
    }

    const latest = [...c.submissions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;

    if (latest.result === "approved" || latest.result === "pending" || latest.result === "rejected") {
      counts[latest.result]++;
    }
  }

  return counts;
}
