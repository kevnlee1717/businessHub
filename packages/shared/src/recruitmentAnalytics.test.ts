import { describe, expect, it } from "vitest";
import { computeRecruitmentAnalytics, type RecruitmentAnalyticsInput } from "./recruitmentAnalytics";

describe("computeRecruitmentAnalytics", () => {
  const input: RecruitmentAnalyticsInput = {
    postings: [
      { id: "p1", platform: "LinkedIn", copy_material_id: "m-copy-1", image_material_id: "m-img-1", is_paid: true, cost: 100 },
      { id: "p2", platform: "LinkedIn", copy_material_id: "m-copy-2", image_material_id: null, is_paid: false, cost: null },
      { id: "p3", platform: "Facebook", copy_material_id: null, image_material_id: "m-img-1", is_paid: true, cost: 50 }
    ],
    campaigns: [
      { id: "c1", location: "Jakarta", cost: 300, material_ids: ["m-flyer-1", "m-stand-1"] },
      { id: "c2", location: "Jakarta", cost: 200, material_ids: ["m-flyer-1"] },
      { id: "c3", location: "Bandung", cost: null, material_ids: [] }
    ],
    materials: [
      { id: "m-copy-1", title: "Copy A", type: "copy" },
      { id: "m-img-1", title: "Image A", type: "image" },
      { id: "m-copy-2", title: "Copy B", type: "copy" },
      { id: "m-flyer-1", title: "Flyer A", type: "flyer" },
      { id: "m-stand-1", title: "Stand A", type: "stand" }
    ],
    candidates: [
      { id: "lead-1", status: "offered", source_type: "posting", source_posting_id: "p1", source_campaign_id: null, has_interview: true },
      { id: "lead-2", status: "new", source_type: "posting", source_posting_id: "p1", source_campaign_id: null, has_interview: false },
      { id: "lead-3", status: "offered", source_type: "posting", source_posting_id: "p2", source_campaign_id: null, has_interview: true },
      { id: "lead-4", status: "rejected", source_type: "posting", source_posting_id: "p3", source_campaign_id: null, has_interview: false },
      { id: "lead-5", status: "offered", source_type: "campaign", source_posting_id: null, source_campaign_id: "c1", has_interview: true },
      { id: "lead-6", status: "new", source_type: "campaign", source_posting_id: null, source_campaign_id: "c1", has_interview: false },
      { id: "lead-7", status: "new", source_type: "campaign", source_posting_id: null, source_campaign_id: "c2", has_interview: true },
      { id: "lead-8", status: "new", source_type: "referral", source_posting_id: null, source_campaign_id: null, has_interview: true }
    ]
  };

  it("按平台汇总漏斗，并且 posting cost 只计一次", () => {
    const result = computeRecruitmentAnalytics(input);
    expect(result.platforms).toEqual([
      {
        platform: "LinkedIn",
        leads: 3,
        interviews: 2,
        offers: 2,
        cost: 100,
        postings: 2,
        cost_per_lead: 100 / 3,
        cost_per_offer: 50,
        paid_leads: 2,
        free_leads: 1
      },
      {
        platform: "Facebook",
        leads: 1,
        interviews: 0,
        offers: 0,
        cost: 50,
        postings: 1,
        cost_per_lead: 50,
        cost_per_offer: null,
        paid_leads: 1,
        free_leads: 0
      }
    ]);
  });

  it("按素材汇总 posting copy/image 和 campaign material leads", () => {
    const result = computeRecruitmentAnalytics(input);
    expect(result.materials).toEqual([
      { material_id: "m-flyer-1", title: "Flyer A", type: "flyer", leads: 3, interviews: 2, offers: 1 },
      { material_id: "m-img-1", title: "Image A", type: "image", leads: 3, interviews: 1, offers: 1 },
      { material_id: "m-copy-1", title: "Copy A", type: "copy", leads: 2, interviews: 1, offers: 1 },
      { material_id: "m-stand-1", title: "Stand A", type: "stand", leads: 2, interviews: 1, offers: 1 },
      { material_id: "m-copy-2", title: "Copy B", type: "copy", leads: 1, interviews: 1, offers: 1 }
    ]);
  });

  it("按地点汇总活动漏斗和活动费用", () => {
    const result = computeRecruitmentAnalytics(input);
    expect(result.locations).toEqual([
      {
        location: "Jakarta",
        leads: 3,
        interviews: 2,
        offers: 1,
        cost: 500,
        campaigns: 2,
        cost_per_lead: 500 / 3,
        cost_per_offer: 500
      },
      {
        location: "Bandung",
        leads: 0,
        interviews: 0,
        offers: 0,
        cost: 0,
        campaigns: 1,
        cost_per_lead: null,
        cost_per_offer: null
      }
    ]);
  });

  it("拆分 paid vs free，并且费用按 posting 去重计", () => {
    const result = computeRecruitmentAnalytics(input);
    expect(result.paid_vs_free).toEqual([
      { group: "paid", leads: 3, interviews: 1, offers: 1, cost: 150 },
      { group: "free", leads: 1, interviews: 1, offers: 1, cost: 0 }
    ]);
  });
});
