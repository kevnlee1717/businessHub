import { type FoodCourtInput } from "../../api/fnbFoodCourts";

export type FoodCourtCalcResult = {
  rent: number;
  adv: number;
  mdr: number;
  fixed: number;
  feeSub: number;
  gst: number;
  entrance: number;
  F: number;
  healthPct: number;
  food: number;
  remainder: number;
  profit: number;
  investor: number;
  couple: number;
};

export type HealthLevel = "good" | "low" | "high";

function n(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function calcAtRevenue(fc: FoodCourtInput, R: number): FoodCourtCalcResult {
  const fixedFees = fc.fixed_fees;
  const rent = Math.max((n(fc.rent_pct) / 100) * R, n(fc.min_rent));
  const adv = (n(fc.adv_pct) / 100) * R;
  const mdr = (n(fc.mdr_pct) / 100) * R;
  const fixed =
    n(fixedFees.cleaning) +
    n(fixedFees.maintenance) +
    n(fixedFees.pos) +
    n(fixedFees.subscription) +
    n(fixedFees.bank) +
    n(fixedFees.legal) +
    n(fixedFees.other);
  const feeSub = rent + adv + mdr + fixed;
  const gst = fc.include_gst ? (n(fc.gst_pct) / 100) * feeSub : 0;
  const entrance = n(fc.entrance_months) > 0 ? n(fc.entrance_total) / n(fc.entrance_months) : 0;
  const F = feeSub + gst + entrance;
  const healthPct = R > 0 ? (F / R) * 100 : Number.POSITIVE_INFINITY;
  const food = (n(fc.food_pct) / 100) * R;
  const remainder = R - F - food;
  const profit = remainder - n(fc.salary);
  const investor = profit >= n(fc.profit_target) ? profit / 2 : n(fc.investor_floor);
  const couple = Math.max(profit >= n(fc.profit_target) ? n(fc.salary) + profit / 2 : n(fc.salary) + profit - n(fc.investor_floor), 0);

  return {
    rent,
    adv,
    mdr,
    fixed,
    feeSub,
    gst,
    entrance,
    F,
    healthPct,
    food,
    remainder,
    profit,
    investor,
    couple
  };
}

export function solveBreakEven(fc: FoodCourtInput): number | null {
  const target = n(fc.profit_target);
  let low = 0;
  let high = 200000;

  if (calcAtRevenue(fc, high).profit < target) return null;

  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) / 2;
    if (calcAtRevenue(fc, mid).profit >= target) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return Math.round(high);
}

export function healthLevel(pct: number): HealthLevel {
  if (pct < 30) return "low";
  if (pct > 35) return "high";
  return "good";
}
