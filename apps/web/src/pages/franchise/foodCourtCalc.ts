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
  mgmt: number;
  remainder: number;
  profit: number;
  investor: number;
  couple: number;
  excess: number;
  mgmtTotal: number;
  // 收入构成明细(给「i」浮框用)
  investorShare: number; // 51%×P_low + 25%×P_high
  investorExcess: number; // 25%×P_high(超额分成)
  investorTopup: number; // 夫妻补给投资人(达到保底 2800)
  coupleGross: number; // 工资毛 min(L−2800, 8000)
  coupleWage: number; // 工资实到(还款后)
  coupleShare: number; // 夫妻利润分成(residual − 工资实到)
  coupleExcess: number; // 25%×P_high(超额分成)
  coupleAdjust: number; // 正=还管理公司,负=管理公司补
  mgmtShare: number; // 50%×P_high
};

export type HealthLevel = "good" | "low" | "high";

function n(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function calcAtRevenue(fc: FoodCourtInput, R: number, opts: { noRepay?: boolean } = {}): FoodCourtCalcResult {
  const fixedFees = fc.fixed_fees;
  const rent = Math.max((n(fc.rent_pct) / 100) * R, n(fc.min_rent));
  const adv = fc.adv_mode === "fixed" ? n(fc.adv_pct) : (n(fc.adv_pct) / 100) * R;
  const mdr = fc.mdr_mode === "fixed" ? n(fc.mdr_pct) : (n(fc.mdr_pct) / 100) * R;
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
  const entrance = n(fc.entrance_monthly);
  const F = feeSub + gst + entrance;
  const healthPct = R > 0 ? (F / R) * 100 : Number.POSITIVE_INFINITY;
  const food = (n(fc.food_pct) / 100) * R;
  const mgmt = (n(fc.mgmt_pct) / 100) * R; // 管理费 3%
  const remainder = R - F - food - mgmt; // 人工前利润 L
  const salary = n(fc.salary); // 8000 夫妻满额工资 / 工资封顶
  const profit = remainder - salary; // 纯利润 P

  const invFloor = n(fc.investor_floor); // 2800
  const coupleFloor = n(fc.couple_floor); // 3000
  const repayCap = n(fc.couple_repay_cap); // 4167

  // ① 夫妻工资:毛额 min(L − 2800, 8000),保底 3000 / 还款封顶 4167
  const coupleGross = Math.min(remainder - invFloor, salary);
  let coupleWage: number;
  if (coupleGross < coupleFloor) {
    coupleWage = coupleFloor; // 管理公司补到 3000
  } else if (opts.noRepay) {
    coupleWage = coupleGross; // 第 2 年起不再还管理公司,保留全额工资
  } else {
    coupleWage = coupleGross - Math.min(coupleGross - coupleFloor, repayCap); // 还管理公司,封顶 4167
  }
  const coupleAdjust = coupleGross - coupleWage; // 正=还款给管理公司,负=管理公司补

  // ② 纯利润 P 分成:≤5600 投资人51%/夫妻49%;>5600 管理50%/投资人25%/夫妻25%
  const threshold = n(fc.profit_target); // 5600
  const pPos = Math.max(profit, 0);
  const pLow = Math.min(pPos, threshold);
  const pHigh = Math.max(pPos - threshold, 0);
  const excess = pHigh; // 多出来的利润(P 超 5600 部分)

  const invLow = n(fc.investor_share_pct) / 100; // 0.51
  const mgmtHigh = n(fc.excess_mgmt_pct) / 100; // 0.50
  const cplHigh = n(fc.excess_couple_pct) / 100; // 0.25
  const invHigh = Math.max(1 - mgmtHigh - cplHigh, 0); // 0.25

  const investorShare = invLow * pLow + invHigh * pHigh;
  const investorExcess = invHigh * pHigh; // 投资人超额分成 25%×P_high
  const coupleExcess = cplHigh * pHigh; // 夫妻超额分成 25%×P_high
  const mgmtShare = mgmtHigh * pHigh; // 50% × P 超额段

  // ③ 投资人保底 2800(缺口由 L−2800 预留补足);管理公司只拿 回款 + 50%超额
  const investor = Math.max(investorShare, invFloor); // 投资人合计
  const investorTopup = investor - investorShare; // 保底补足
  const mgmtFromL = coupleAdjust + mgmtShare; // 管理公司从 L 拿
  const couple = remainder - investor - mgmtFromL; // 夫妻实到 = L 余额(保证守恒)
  const coupleShare = couple - coupleWage; // 夫妻利润分成(工资实到之外的部分)
  const mgmtTotal = mgmt + mgmtFromL; // 管理公司合计(管理费 + 回款 + 50%超额)

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
    mgmt,
    remainder,
    profit,
    investor,
    couple,
    excess,
    mgmtTotal,
    investorShare,
    investorExcess,
    investorTopup,
    coupleGross,
    coupleWage,
    coupleShare,
    coupleExcess,
    coupleAdjust,
    mgmtShare
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
