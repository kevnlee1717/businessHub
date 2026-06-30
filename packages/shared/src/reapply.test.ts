import { describe, it, expect } from "vitest";
import { computeReapplyStatus, REAPPLY_WAIT_MONTHS } from "./reapply";

const now = new Date("2026-06-29T00:00:00Z");

describe("computeReapplyStatus", () => {
  it("无提交记录 → pending", () => {
    expect(computeReapplyStatus([], now)).toEqual({ state: "pending", eligibleAt: null, daysRemaining: null });
  });
  it("最新 approved → approved", () => {
    const r = computeReapplyStatus([
      { result: "rejected", rejectedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
      { result: "approved", rejectedAt: null, createdAt: "2026-05-01T00:00:00Z" }
    ], now);
    expect(r.state).toBe("approved");
  });
  it("最新 pending → pending", () => {
    expect(computeReapplyStatus([{ result: "pending", rejectedAt: null, createdAt: "2026-06-01T00:00:00Z" }], now).state).toBe("pending");
  });
  it("最新 rejected 但无拒绝日期 → rejected_no_date", () => {
    expect(computeReapplyStatus([{ result: "rejected", rejectedAt: null, createdAt: "2026-06-01T00:00:00Z" }], now).state).toBe("rejected_no_date");
  });
  it("rejected 拒绝日期+3月在未来 → waiting，daysRemaining>0", () => {
    const r = computeReapplyStatus([{ result: "rejected", rejectedAt: "2026-06-01T00:00:00Z", createdAt: "2026-06-01T00:00:00Z" }], now);
    expect(r.state).toBe("waiting");
    expect(r.eligibleAt).toBe(new Date("2026-09-01T00:00:00Z").toISOString());
    expect(r.daysRemaining).toBeGreaterThan(0);
  });
  it("rejected 拒绝日期+3月已过 → eligible，daysRemaining<=0", () => {
    const r = computeReapplyStatus([{ result: "rejected", rejectedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }], now);
    expect(r.state).toBe("eligible");
    expect(r.daysRemaining).toBeLessThanOrEqual(0);
  });
  it("多条取最新一条(按 createdAt 倒序)", () => {
    const r = computeReapplyStatus([
      { result: "rejected", rejectedAt: "2025-10-01T00:00:00Z", createdAt: "2025-10-01T00:00:00Z" },
      { result: "rejected", rejectedAt: "2026-06-01T00:00:00Z", createdAt: "2026-06-01T00:00:00Z" }
    ], now);
    expect(r.eligibleAt).toBe(new Date("2026-09-01T00:00:00Z").toISOString());
  });
  it("常量为 3", () => { expect(REAPPLY_WAIT_MONTHS).toBe(3); });
});
