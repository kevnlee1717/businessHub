export interface IcaStatsSubmissionInput {
  result: "pending" | "approved" | "rejected";
  submittedAt: string;
  createdAt: string;
}

export interface IcaStatsCaseInput {
  caseId: string;
  submissions: IcaStatsSubmissionInput[];
}

export interface IcaStatsMonth {
  month: number;
  count: number;
}

export interface IcaStatsYear {
  year: number;
  total: number;
  months: IcaStatsMonth[];
}

export interface IcaStats {
  summary: { totalClients: number; approved: number; rejected: number; pending: number };
  years: IcaStatsYear[];
}

export function computeIcaStats(cases: IcaStatsCaseInput[]): IcaStats {
  let approved = 0;
  let rejected = 0;
  let pending = 0;

  const yearMonthCounts = new Map<number, Map<number, number>>();

  for (const c of cases) {
    if (c.submissions.length === 0) {
      pending++;
      continue;
    }

    // 最新一轮：按 submittedAt desc, createdAt desc
    const sortedDesc = [...c.submissions].sort((a, b) => {
      const cmp = b.submittedAt.localeCompare(a.submittedAt);
      if (cmp !== 0) return cmp;
      return b.createdAt.localeCompare(a.createdAt);
    });
    const latest = sortedDesc[0]!;
    if (latest.result === "approved") approved++;
    else if (latest.result === "rejected") rejected++;
    else pending++;

    // 首次申诉月：按 submittedAt asc, createdAt asc
    const sortedAsc = [...c.submissions].sort((a, b) => {
      const cmp = a.submittedAt.localeCompare(b.submittedAt);
      if (cmp !== 0) return cmp;
      return a.createdAt.localeCompare(b.createdAt);
    });
    const earliest = sortedAsc[0]!;
    const date = new Date(earliest.submittedAt);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 1-based

    if (!yearMonthCounts.has(year)) {
      yearMonthCounts.set(year, new Map());
    }
    const monthMap = yearMonthCounts.get(year)!;
    monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
  }

  // 按年份倒序
  const yearEntries = [...yearMonthCounts.entries()].sort((a, b) => b[0] - a[0]);

  const years: IcaStatsYear[] = yearEntries.map(([year, monthMap]) => {
    const months: IcaStatsMonth[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: monthMap.get(i + 1) ?? 0
    }));
    const total = months.reduce((sum, m) => sum + m.count, 0);
    return { year, total, months };
  });

  return {
    summary: { totalClients: cases.length, approved, rejected, pending },
    years
  };
}
