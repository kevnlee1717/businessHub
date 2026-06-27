export type MilestoneStage = {
  seq: number;
  label: string;
  basis: "percent" | "fixed";
  value: number;
};

export type MilestoneSplitAllocation = {
  basis: "percent" | "fixed";
  value: number;
};

export type MilestoneSplit = Record<string, MilestoneSplitAllocation>;

export type SplitCommissionByMilestonesArgs = {
  commissionTotal: number;
  revenueTotal: number;
  milestones: MilestoneStage[];
  milestoneSplit?: MilestoneSplit | null;
};

export type SplitCommissionByMilestonesResult = {
  milestoneSeq: number | null;
  label: string | null;
  amount: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeAllocation(
  allocation: MilestoneSplitAllocation | number | undefined
): MilestoneSplitAllocation | undefined {
  if (allocation === undefined) {
    return undefined;
  }

  if (typeof allocation === "number") {
    return { basis: "percent", value: allocation };
  }

  return allocation;
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
    const allocation = normalizeAllocation(
      (milestoneSplit as Record<string, MilestoneSplitAllocation | number> | null | undefined)?.[
        String(stage.seq)
      ]
    );
    let amount: number;

    if (isLast) {
      amount = round2(commissionTotal - allocated);
    } else if (allocation?.basis === "fixed") {
      amount = round2(allocation.value);
    } else {
      const stageRevenue = stage.basis === "percent" ? (revenueTotal * stage.value) / 100 : stage.value;
      const allocationPercent =
        allocation?.basis === "percent"
          ? allocation.value
          : revenueTotal > 0
            ? (stageRevenue / revenueTotal) * 100
            : 100 / sortedMilestones.length;

      amount = round2((commissionTotal * allocationPercent) / 100);
    }

    allocated = round2(allocated + amount);

    return {
      milestoneSeq: stage.seq,
      label: stage.label,
      amount
    };
  });
}
