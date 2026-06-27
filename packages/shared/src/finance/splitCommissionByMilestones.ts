export type MilestoneStage = {
  seq: number;
  label: string;
  basis: "percent" | "fixed";
  value: number;
};

export type SplitCommissionByMilestonesArgs = {
  commissionTotal: number;
  revenueTotal: number;
  milestones: MilestoneStage[];
  milestoneSplit?: Record<string, number> | null;
};

export type SplitCommissionByMilestonesResult = {
  milestoneSeq: number | null;
  label: string | null;
  amount: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function splitCommissionByMilestones({
  commissionTotal,
  revenueTotal,
  milestones,
  milestoneSplit
}: SplitCommissionByMilestonesArgs): SplitCommissionByMilestonesResult[] {
  if (milestones.length === 0) {
    return [{ milestoneSeq: null, label: null, amount: round2(commissionTotal) }];
  }

  const sortedMilestones = [...milestones].sort((a, b) => a.seq - b.seq);
  let allocated = 0;

  return sortedMilestones.map((stage, index) => {
    const isLast = index === sortedMilestones.length - 1;
    const splitValue = milestoneSplit?.[String(stage.seq)];
    const stageRevenue = stage.basis === "percent" ? (revenueTotal * stage.value) / 100 : stage.value;
    const allocationPercent =
      splitValue !== undefined
        ? splitValue
        : revenueTotal > 0
          ? (stageRevenue / revenueTotal) * 100
          : 100 / sortedMilestones.length;
    const amount = isLast
      ? round2(commissionTotal - allocated)
      : round2((commissionTotal * allocationPercent) / 100);

    allocated = round2(allocated + amount);

    return {
      milestoneSeq: stage.seq,
      label: stage.label,
      amount
    };
  });
}
