import type { DealInputs, SchemeLineInput } from "./dealEconomics";

export type DealPreset = {
  key: "custom" | "one_time" | "monthly_margin" | "per_night_share" | "per_head_multi";
  name: string;
  nameEn: string;
  lines: SchemeLineInput[];
  assumedInputs: DealInputs;
};

export const DEAL_PRESETS: DealPreset[] = [
  {
    key: "custom",
    name: "自定义",
    nameEn: "Custom",
    lines: [],
    assumedInputs: {}
  },
  {
    key: "one_time",
    name: "一次性卖断",
    nameEn: "One-time Sale",
    lines: [
      {
        kind: "revenue",
        basis: "fixed",
        recurrence: "one_time",
        rate: 5000,
        label: "总价"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "one_time",
        rate: 10,
        partyCode: "sales",
        label: "业务员提成"
      }
    ],
    assumedInputs: {}
  },
  {
    key: "monthly_margin",
    name: "月度差价",
    nameEn: "Monthly Margin",
    lines: [
      {
        kind: "revenue",
        basis: "margin",
        recurrence: "monthly",
        inputKey: "unit",
        label: "月度差价"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "monthly",
        rate: 10,
        partyCode: "sales",
        label: "业务员提成"
      }
    ],
    assumedInputs: { months: 12, unit_sell: 800, unit_cost: 500 }
  },
  {
    key: "per_night_share",
    name: "按晚抽成",
    nameEn: "Per-night Share",
    lines: [
      {
        kind: "revenue",
        basis: "per_unit",
        recurrence: "per_event",
        rate: 20,
        unitLabel: "晚",
        inputKey: "nights",
        label: "每晚抽成"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "per_event",
        rate: 10,
        partyCode: "sales",
        label: "业务员提成"
      }
    ],
    // 每个事件按 1 晚计，预期事件数表达预计晚数，便于后续实算按事件台账对齐。
    assumedInputs: { events: 30, nights: 1 }
  },
  {
    key: "per_head_multi",
    name: "按人头多方抽成",
    nameEn: "Per-head Multi-party Share",
    lines: [
      {
        kind: "revenue",
        basis: "per_unit",
        recurrence: "monthly",
        rate: 300,
        unitLabel: "人头",
        inputKey: "headcount",
        label: "客户人头费"
      },
      {
        kind: "revenue",
        basis: "per_unit",
        recurrence: "monthly",
        rate: 50,
        unitLabel: "人头",
        inputKey: "headcount",
        partyCode: "hr_source",
        label: "HR 返点"
      },
      {
        kind: "commission",
        basis: "percent_of_revenue",
        recurrence: "monthly",
        rate: 10,
        partyCode: "sales",
        label: "sales 提成"
      },
      {
        kind: "cost",
        basis: "fixed",
        recurrence: "monthly",
        rate: 200,
        label: "办公分摊"
      }
    ],
    assumedInputs: { headcount: 10, months: 12 }
  }
];
