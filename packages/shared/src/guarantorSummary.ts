import type { GuarantorStats } from "./guarantorStats";

export interface GuarantorSummary {
  guarantorCount: number;
  sponsoredTotal: number;
  approved: number;
  rejected: number;
  successRate: number | null;
}

export function computeGuarantorSummary(
  perGuarantor: Pick<GuarantorStats, "total" | "approved" | "rejected">[]
): GuarantorSummary {
  const guarantorCount = perGuarantor.length;
  const sponsoredTotal = perGuarantor.reduce((s, g) => s + g.total, 0);
  const approved = perGuarantor.reduce((s, g) => s + g.approved, 0);
  const rejected = perGuarantor.reduce((s, g) => s + g.rejected, 0);
  const decided = approved + rejected;
  return {
    guarantorCount,
    sponsoredTotal,
    approved,
    rejected,
    successRate: decided === 0 ? null : approved / decided
  };
}
