export interface AnalyticsCandidate {
  id: string;
  status: string;
  source_type: string;
  source_posting_id: string | null;
  source_campaign_id: string | null;
  has_interview: boolean;
}

export interface AnalyticsPosting {
  id: string;
  platform: string;
  copy_material_id: string | null;
  image_material_id: string | null;
  is_paid: boolean;
  cost: number | null;
}

export interface AnalyticsCampaign {
  id: string;
  location: string;
  cost: number | null;
  material_ids: string[];
}

export interface AnalyticsMaterial {
  id: string;
  title: string;
  type: string;
}

export interface RecruitmentAnalyticsInput {
  candidates: AnalyticsCandidate[];
  postings: AnalyticsPosting[];
  campaigns: AnalyticsCampaign[];
  materials: AnalyticsMaterial[];
}

export interface RecruitmentFunnelStats {
  leads: number;
  interviews: number;
  offers: number;
}

export interface RecruitmentPlatformAnalytics extends RecruitmentFunnelStats {
  platform: string;
  cost: number;
  postings: number;
  cost_per_lead: number | null;
  cost_per_offer: number | null;
  paid_leads: number;
  free_leads: number;
}

export interface RecruitmentMaterialAnalytics extends RecruitmentFunnelStats {
  material_id: string;
  title: string;
  type: string;
}

export interface RecruitmentLocationAnalytics extends RecruitmentFunnelStats {
  location: string;
  cost: number;
  campaigns: number;
  cost_per_lead: number | null;
  cost_per_offer: number | null;
}

export interface RecruitmentPaidFreeAnalytics extends RecruitmentFunnelStats {
  group: "paid" | "free";
  cost: number;
}

export interface RecruitmentAnalyticsResult {
  platforms: RecruitmentPlatformAnalytics[];
  materials: RecruitmentMaterialAnalytics[];
  locations: RecruitmentLocationAnalytics[];
  paid_vs_free: RecruitmentPaidFreeAnalytics[];
}

type MutableStats = RecruitmentFunnelStats;

function addCandidate(stats: MutableStats, candidate: AnalyticsCandidate) {
  stats.leads += 1;
  if (candidate.has_interview) stats.interviews += 1;
  if (candidate.status === "offered") stats.offers += 1;
}

function emptyStats(): MutableStats {
  return { leads: 0, interviews: 0, offers: 0 };
}

function rate(cost: number, denominator: number): number | null {
  return denominator > 0 ? cost / denominator : null;
}

export function computeRecruitmentAnalytics(input: RecruitmentAnalyticsInput): RecruitmentAnalyticsResult {
  const postingById = new Map(input.postings.map((posting) => [posting.id, posting]));
  const campaignById = new Map(input.campaigns.map((campaign) => [campaign.id, campaign]));
  const materialById = new Map(input.materials.map((material) => [material.id, material]));

  const platformStats = new Map<string, MutableStats & { paid_leads: number; free_leads: number }>();
  const platformPostings = new Map<string, AnalyticsPosting[]>();
  for (const posting of input.postings) {
    if (!platformStats.has(posting.platform)) {
      platformStats.set(posting.platform, { ...emptyStats(), paid_leads: 0, free_leads: 0 });
      platformPostings.set(posting.platform, []);
    }
    platformPostings.get(posting.platform)!.push(posting);
  }

  const materialStats = new Map<string, MutableStats>();
  const locationStats = new Map<string, MutableStats>();
  const locationCampaigns = new Map<string, AnalyticsCampaign[]>();
  for (const campaign of input.campaigns) {
    if (!locationStats.has(campaign.location)) {
      locationStats.set(campaign.location, emptyStats());
      locationCampaigns.set(campaign.location, []);
    }
    locationCampaigns.get(campaign.location)!.push(campaign);
  }

  const paidVsFree: Record<"paid" | "free", RecruitmentPaidFreeAnalytics> = {
    paid: { group: "paid", ...emptyStats(), cost: 0 },
    free: { group: "free", ...emptyStats(), cost: 0 }
  };

  for (const posting of input.postings) {
    const group = posting.is_paid ? "paid" : "free";
    paidVsFree[group].cost += posting.cost ?? 0;
  }

  for (const candidate of input.candidates) {
    if (candidate.source_type === "posting" && candidate.source_posting_id) {
      const posting = postingById.get(candidate.source_posting_id);
      if (!posting) continue;

      const platform = platformStats.get(posting.platform);
      if (platform) {
        addCandidate(platform, candidate);
        if (posting.is_paid) platform.paid_leads += 1;
        else platform.free_leads += 1;
      }

      addCandidate(paidVsFree[posting.is_paid ? "paid" : "free"], candidate);

      for (const materialId of [posting.copy_material_id, posting.image_material_id]) {
        if (!materialId || !materialById.has(materialId)) continue;
        const stats = materialStats.get(materialId) ?? emptyStats();
        addCandidate(stats, candidate);
        materialStats.set(materialId, stats);
      }
    }

    if (candidate.source_type === "campaign" && candidate.source_campaign_id) {
      const campaign = campaignById.get(candidate.source_campaign_id);
      if (!campaign) continue;

      const location = locationStats.get(campaign.location);
      if (location) addCandidate(location, candidate);

      for (const materialId of campaign.material_ids) {
        if (!materialById.has(materialId)) continue;
        const stats = materialStats.get(materialId) ?? emptyStats();
        addCandidate(stats, candidate);
        materialStats.set(materialId, stats);
      }
    }
  }

  const platforms = [...platformStats.entries()]
    .map(([platform, stats]) => {
      const postings = platformPostings.get(platform) ?? [];
      const cost = postings.reduce((sum, posting) => sum + (posting.cost ?? 0), 0);
      return {
        platform,
        leads: stats.leads,
        interviews: stats.interviews,
        offers: stats.offers,
        cost,
        postings: postings.length,
        cost_per_lead: rate(cost, stats.leads),
        cost_per_offer: rate(cost, stats.offers),
        paid_leads: stats.paid_leads,
        free_leads: stats.free_leads
      };
    })
    .sort((a, b) => b.leads - a.leads || a.platform.localeCompare(b.platform));

  const materials = [...materialStats.entries()]
    .map(([materialId, stats]) => {
      const material = materialById.get(materialId)!;
      return {
        material_id: materialId,
        title: material.title,
        type: material.type,
        leads: stats.leads,
        interviews: stats.interviews,
        offers: stats.offers
      };
    })
    .sort((a, b) => b.leads - a.leads || a.material_id.localeCompare(b.material_id));

  const locations = [...locationStats.entries()]
    .map(([location, stats]) => {
      const campaigns = locationCampaigns.get(location) ?? [];
      const cost = campaigns.reduce((sum, campaign) => sum + (campaign.cost ?? 0), 0);
      return {
        location,
        leads: stats.leads,
        interviews: stats.interviews,
        offers: stats.offers,
        cost,
        campaigns: campaigns.length,
        cost_per_lead: rate(cost, stats.leads),
        cost_per_offer: rate(cost, stats.offers)
      };
    })
    .sort((a, b) => b.leads - a.leads || a.location.localeCompare(b.location));

  return {
    platforms,
    materials,
    locations,
    paid_vs_free: [paidVsFree.paid, paidVsFree.free]
  };
}
