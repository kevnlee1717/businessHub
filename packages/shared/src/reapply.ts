export const REAPPLY_WAIT_MONTHS = 3;

export type ReapplyState = "approved" | "pending" | "eligible" | "waiting" | "rejected_no_date";

export interface ReapplySubmissionInput {
  result: "pending" | "approved" | "rejected";
  rejectedAt: string | null;
  createdAt: string;
}

export interface ReapplyStatus {
  state: ReapplyState;
  eligibleAt: string | null;
  daysRemaining: number | null;
}

export function computeReapplyStatus(submissions: ReapplySubmissionInput[], now: Date): ReapplyStatus {
  if (submissions.length === 0) return { state: "pending", eligibleAt: null, daysRemaining: null };
  const latest = [...submissions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
  if (latest.result === "approved") return { state: "approved", eligibleAt: null, daysRemaining: null };
  if (latest.result === "pending") return { state: "pending", eligibleAt: null, daysRemaining: null };
  if (!latest.rejectedAt) return { state: "rejected_no_date", eligibleAt: null, daysRemaining: null };
  const eligible = new Date(latest.rejectedAt);
  eligible.setMonth(eligible.getMonth() + REAPPLY_WAIT_MONTHS);
  const daysRemaining = Math.ceil((eligible.getTime() - now.getTime()) / 86_400_000);
  return { state: daysRemaining > 0 ? "waiting" : "eligible", eligibleAt: eligible.toISOString(), daysRemaining };
}
