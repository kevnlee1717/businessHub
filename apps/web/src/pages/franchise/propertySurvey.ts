import { type FranchiseService } from "@bh/shared";

export type PropertySurveyLang = "zh" | "en";
export type PropertySurveyOption = {
  value: string;
  label: Record<PropertySurveyLang, string>;
};
export type PropertySurveyField = {
  key: string;
  type: "single" | "multi";
  label: Record<PropertySurveyLang, string>;
  options: PropertySurveyOption[];
  showWhen?: { field: string; value: string };
};
export type PropertySurveySection = {
  key: string;
  title: Record<PropertySurveyLang, string>;
  services: FranchiseService[];
  fields: PropertySurveyField[];
};

const option = (value: string, zh: string, en: string): PropertySurveyOption => ({
  value,
  label: { zh, en }
});

export const propertySurveyServices: { value: FranchiseService; label: Record<PropertySurveyLang, string> }[] = [
  { value: "vending_machine", label: { zh: "自动贩卖机", en: "Vending machine" } },
  { value: "massage_chair", label: { zh: "按摩椅", en: "Massage chair" } },
  { value: "cleaning_robot", label: { zh: "清洁机器人", en: "Cleaning robot" } },
  { value: "ai_mattress", label: { zh: "酒店AI助眠床垫", en: "Hotel AI sleep mattress" } },
  { value: "security", label: { zh: "保安服务", en: "Security service" } },
  { value: "cleaning", label: { zh: "保洁服务", en: "Cleaning service" } }
];

export const propertySurveySections: PropertySurveySection[] = [
  {
    key: "vending_massage",
    title: { zh: "A. 贩卖机 & 按摩椅", en: "A. Vending machine & massage chair" },
    services: ["vending_machine", "massage_chair"],
    fields: [
      {
        key: "possible_locations",
        type: "multi",
        label: { zh: "可放位置", en: "Possible locations" },
        options: [
          option("lobby_entrance", "大堂/入口", "Lobby / entrance"),
          option("lift_area", "电梯口", "Lift area"),
          option("fnb_rest", "餐饮/休息区", "F&B / rest area"),
          option("corridor", "走廊", "Corridor"),
          option("outdoor", "户外", "Outdoor"),
          option("other", "其他", "Other")
        ]
      },
      {
        key: "estimated_units",
        type: "single",
        label: { zh: "预计数量", en: "Estimated units" },
        options: [option("1", "1", "1"), option("2_3", "2-3", "2-3"), option("4_6", "4-6", "4-6"), option("6_plus", "6+", "6+")]
      },
      {
        key: "model",
        type: "single",
        label: { zh: "合作方式", en: "Commercial model" },
        options: [
          option("fixed_rent", "固定场地租金(每台/月)", "Fixed site rent per unit/month"),
          option("revenue_share", "按营收分成", "Revenue share"),
          option("free_amenity", "免费提供场地(作便民/增值)", "Free amenity")
        ]
      },
      {
        key: "rent_band",
        type: "single",
        label: { zh: "固定租金区间", en: "Rent band" },
        showWhen: { field: "model", value: "fixed_rent" },
        options: [
          option("lt_100", "<S$100", "<S$100"),
          option("100_300", "S$100-300", "S$100-300"),
          option("300_600", "S$300-600", "S$300-600"),
          option("600_plus", "S$600+", "S$600+")
        ]
      },
      {
        key: "share_pct",
        type: "single",
        label: { zh: "营收分成比例", en: "Revenue share percentage" },
        showWhen: { field: "model", value: "revenue_share" },
        options: [option("10", "10%", "10%"), option("15", "15%", "15%"), option("20", "20%", "20%"), option("negotiable", "面议", "Negotiable")]
      },
      {
        key: "existing_machines",
        type: "single",
        label: { zh: "已有同类设备", en: "Existing similar machines" },
        options: [option("yes", "有", "Yes"), option("no", "无", "No")]
      }
    ]
  },
  {
    key: "cleaning_robot",
    title: { zh: "B. 清洁机器人", en: "B. Cleaning robot" },
    services: ["cleaning_robot"],
    fields: [
      {
        key: "hard_floor_area",
        type: "single",
        label: { zh: "需清洁硬质地面 sq ft", en: "Hard floor area to clean, sq ft" },
        options: [option("lt_1000", "<1,000", "<1,000"), option("1000_3000", "1,000-3,000", "1,000-3,000"), option("3000_10000", "3,000-10,000", "3,000-10,000"), option("gt_10000", ">10,000", ">10,000")]
      },
      {
        key: "floor_type",
        type: "single",
        label: { zh: "地面类型", en: "Floor type" },
        options: [option("mostly_hard", "硬地为主", "Mostly hard floor"), option("mostly_carpet", "地毯为主", "Mostly carpet"), option("mixed", "混合", "Mixed")]
      },
      {
        key: "current_headcount",
        type: "single",
        label: { zh: "目前地面保洁人手", en: "Current cleaning headcount" },
        options: [option("1", "1", "1"), option("2_3", "2-3", "2-3"), option("4_plus", "4+", "4+")]
      },
      {
        key: "monthly_budget",
        type: "single",
        label: { zh: "月租预算", en: "Monthly rental budget" },
        options: [option("lt_1200", "<S$1,200", "<S$1,200"), option("1200_1800", "S$1,200-1,800", "S$1,200-1,800"), option("1800_2500", "S$1,800-2,500", "S$1,800-2,500"), option("please_quote", "请报价", "Please quote")]
      }
    ]
  },
  {
    key: "ai_mattress",
    title: { zh: "C. 酒店AI助眠床垫", en: "C. Hotel AI sleep mattress" },
    services: ["ai_mattress"],
    fields: [
      {
        key: "total_rooms",
        type: "single",
        label: { zh: "房间总数", en: "Total rooms" },
        options: [option("lt_50", "<50", "<50"), option("50_150", "50-150", "50-150"), option("150_300", "150-300", "150-300"), option("300_plus", "300+", "300+")]
      },
      {
        key: "rooms_first",
        type: "single",
        label: { zh: "愿先改造房间数", en: "Rooms for first rollout" },
        options: [option("5_10", "5-10", "5-10"), option("10_30", "10-30", "10-30"), option("30_50", "30-50", "30-50"), option("50_plus", "50+", "50+")]
      },
      {
        key: "avg_room_rate",
        type: "single",
        label: { zh: "目前平均房价/晚", en: "Average room rate/night" },
        options: [option("lt_150", "<S$150", "<S$150"), option("150_300", "S$150-300", "S$150-300"), option("300_500", "S$300-500", "S$300-500"), option("500_plus", "S$500+", "S$500+")]
      },
      {
        key: "extra_charge",
        type: "single",
        label: { zh: "升级后预计每晚可加价", en: "Expected nightly upsell" },
        options: [option("plus_10", "+S$10", "+S$10"), option("plus_20", "+S$20", "+S$20"), option("plus_30", "+S$30", "+S$30"), option("plus_50", "+S$50", "+S$50"), option("unsure", "不确定", "Unsure")]
      },
      {
        key: "occupancy",
        type: "single",
        label: { zh: "平均入住率", en: "Average occupancy" },
        options: [option("lt_50", "<50%", "<50%"), option("50_70", "50-70%", "50-70%"), option("70_85", "70-85%", "70-85%"), option("85_plus", "85%+", "85%+")]
      }
    ]
  },
  {
    key: "security",
    title: { zh: "D. 保安服务", en: "D. Security service" },
    services: ["security"],
    fields: [
      {
        key: "headcount",
        type: "single",
        label: { zh: "需要人数", en: "Required headcount" },
        options: [option("1_2", "1-2", "1-2"), option("3_5", "3-5", "3-5"), option("6_10", "6-10", "6-10"), option("10_plus", "10+", "10+")]
      },
      {
        key: "shift",
        type: "single",
        label: { zh: "班次", en: "Shift" },
        options: [option("day", "白班", "Day"), option("night", "夜班", "Night"), option("24h", "24小时", "24h")]
      },
      {
        key: "budget_per_guard",
        type: "single",
        label: { zh: "每人每月预算", en: "Budget per guard/month" },
        options: [option("lt_2800", "<S$2,800", "<S$2,800"), option("2800_3300", "S$2,800-3,300", "S$2,800-3,300"), option("3300_3800", "S$3,300-3,800", "S$3,300-3,800"), option("negotiable", "面议", "Negotiable")]
      },
      {
        key: "contract_expiry",
        type: "single",
        label: { zh: "现有合同到期", en: "Current contract expiry" },
        options: [option("none", "无", "None"), option("within_3m", "3个月内", "Within 3 months"), option("within_6m", "6个月内", "Within 6 months"), option("within_1y", "1年内", "Within 1 year")]
      }
    ]
  },
  {
    key: "cleaning",
    title: { zh: "E. 保洁服务", en: "E. Cleaning service" },
    services: ["cleaning"],
    fields: [
      {
        key: "headcount",
        type: "single",
        label: { zh: "需要人数", en: "Required headcount" },
        options: [option("1_2", "1-2", "1-2"), option("3_5", "3-5", "3-5"), option("6_10", "6-10", "6-10"), option("10_plus", "10+", "10+")]
      },
      {
        key: "frequency",
        type: "single",
        label: { zh: "频率", en: "Frequency" },
        options: [option("daily", "每天", "Daily"), option("several_week", "每周数次", "Several times/week"), option("periodic", "定期", "Periodic")]
      },
      {
        key: "budget_per_cleaner",
        type: "single",
        label: { zh: "每人每月预算", en: "Budget per cleaner/month" },
        options: [option("lt_2600", "<S$2,600", "<S$2,600"), option("2600_3000", "S$2,600-3,000", "S$2,600-3,000"), option("3000_3500", "S$3,000-3,500", "S$3,000-3,500"), option("negotiable", "面议", "Negotiable")]
      },
      {
        key: "contract_expiry",
        type: "single",
        label: { zh: "现有合同到期", en: "Current contract expiry" },
        options: [option("none", "无", "None"), option("within_3m", "3个月内", "Within 3 months"), option("within_6m", "6个月内", "Within 6 months"), option("within_1y", "1年内", "Within 1 year")]
      }
    ]
  }
];

export function surveyLang(language: string | undefined): PropertySurveyLang {
  return language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function visiblePropertySurveySections(services: FranchiseService[]) {
  return propertySurveySections.filter((section) => section.services.some((service) => services.includes(service)));
}

export function optionLabel(field: PropertySurveyField, value: string, lang: PropertySurveyLang) {
  return field.options.find((option) => option.value === value)?.label[lang] ?? value;
}
