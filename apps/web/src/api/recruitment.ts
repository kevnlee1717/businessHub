import {
  type RecruitmentCampaignStatus,
  type RecruitmentCampaignType,
  type RecruitmentCandidateStatus,
  type RecruitmentFollowupType,
  type RecruitmentInterviewResult,
  type RecruitmentInterviewStatus,
  type RecruitmentJobPriority,
  type RecruitmentJobStatus,
  type RecruitmentMaterialType,
  type RecruitmentPostingStatus,
  type RecruitmentSourceType
} from "@bh/shared";
import { api, ApiError, UnauthorizedError } from "./client";

export const recruitmentKeys = {
  all: ["recruitment"] as const,
  dashboard: () => ["recruitment", "dashboard"] as const,
  industries: () => ["recruitment", "industries"] as const,
  platforms: (params?: unknown) => (params === undefined ? ["recruitment", "platforms"] as const : ["recruitment", "platforms", params] as const),
  promptTemplates: (params?: unknown) => (params === undefined ? ["recruitment", "prompt-templates"] as const : ["recruitment", "prompt-templates", params] as const),
  jobs: (params?: unknown) => ["recruitment", "jobs", params] as const,
  job: (id: string) => ["recruitment", "job", id] as const,
  postings: (params?: unknown) => ["recruitment", "postings", params] as const,
  campaigns: (params?: unknown) => ["recruitment", "campaigns", params] as const,
  campaign: (id: string) => ["recruitment", "campaign", id] as const,
  analytics: (params?: unknown) => ["recruitment", "analytics", params] as const,
  candidates: (params?: unknown) => ["recruitment", "candidates", params] as const,
  candidate: (id: string) => ["recruitment", "candidate", id] as const,
  upcomingInterviews: () => ["recruitment", "interviews", "upcoming"] as const,
  settings: () => ["recruitment", "settings"] as const,
  kpiTargets: (params?: unknown) => ["recruitment", "kpi-targets", params] as const,
  myKpiTargets: (params?: unknown) => ["recruitment", "kpi-targets", "my", params] as const,
  groupOwners: (params?: unknown) => ["recruitment", "group-owners", params] as const,
  ifmCompaniesCache: () => ["recruitment", "ifm", "companies-cache"] as const,
  ifmUserBindings: () => ["recruitment", "ifm", "user-bindings"] as const
};

export type RecruitmentIndustry = {
  id: string;
  company_id: string;
  name: string;
  name_i18n?: { zh?: string | null; en?: string | null };
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecruitmentPlatform = {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecruitmentPromptTemplate = {
  id: string;
  company_id: string;
  material_type: RecruitmentMaterialType;
  base_prompt: string;
  created_at: string;
  updated_at: string;
};

export type RecruitmentJob = {
  id: string;
  company_id: string;
  industry_id?: string | null;
  title: string;
  title_i18n?: { zh?: string | null; en?: string | null };
  headcount: number;
  salary_min?: number | null;
  salary_max?: number | null;
  employment_types?: ("full_time" | "part_time")[];
  pt_salary_min?: number | null;
  pt_salary_max?: number | null;
  salary_note?: string | null;
  salaryNote_i18n?: { zh?: string | null; en?: string | null };
  job_content?: string | null;
  jobContent_i18n?: { zh?: string | null; en?: string | null };
  requirements?: string | null;
  requirements_i18n?: { zh?: string | null; en?: string | null };
  nationalities: string[];
  status: RecruitmentJobStatus;
  priority: RecruitmentJobPriority;
  owner_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type RecruitmentMaterial = {
  id: string;
  company_id: string;
  job_id: string;
  type: RecruitmentMaterialType;
  title: string;
  source_text?: string | null;
  tune_prompt?: string | null;
  text_content?: string | null;
  document_id?: string | null;
  platforms?: string[] | null;
  active: boolean;
  ai_generated: boolean;
  usage_count: number;
  document?: { id: string; storage_path: string; filename: string; mime?: string | null } | null;
  created_at: string;
  updated_at: string;
};

export type RecruitmentPosting = {
  id: string;
  company_id: string;
  job_id: string;
  platform: string;
  copy_material_id?: string | null;
  image_material_id?: string | null;
  share_url?: string | null;
  screenshot_document_id?: string | null;
  screenshot_document?: { id: string; storage_path: string; filename: string; mime?: string | null } | null;
  published_on: string;
  is_paid?: boolean;
  cost?: number | null;
  status: RecruitmentPostingStatus;
  owner_id: string;
  invite_clerk_id?: string | null;
  inquiry_count: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type RecruitmentCampaign = {
  id: string;
  company_id: string;
  name: string;
  type: RecruitmentCampaignType;
  status: RecruitmentCampaignStatus;
  location: string;
  cost?: number | null;
  planned_date: string;
  planned_start: string;
  planned_end: string;
  actual_date?: string | null;
  owner_id: string;
  notes?: string | null;
  job_ids?: string[];
  created_at: string;
  updated_at: string;
};

export type RecruitmentCandidate = {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  nationality?: string | null;
  ethnicity?: string | null;
  age_band?: string | null;
  experience_level?: string | null;
  photo_document_id?: string | null;
  resume_document_id?: string | null;
  source_type: RecruitmentSourceType;
  source_posting_id?: string | null;
  source_campaign_id?: string | null;
  intended_job_id?: string | null;
  status: RecruitmentCandidateStatus;
  assigned_clerk_id?: string | null;
  in_talent_pool: boolean;
  reusable_later: boolean;
  reusable_note?: string | null;
  last_contacted_at?: string | null;
  notes?: string | null;
  interview_count?: number;
  created_at: string;
  updated_at: string;
};

export type RecruitmentFollowup = {
  id: string;
  company_id: string;
  candidate_id: string;
  by_employee_id: string;
  type: RecruitmentFollowupType;
  note: string;
  contacted_at: string;
  created_at: string;
  updated_at: string;
};

export type RecruitmentInterview = {
  id: string;
  company_id: string;
  candidate_id: string;
  scheduled_at: string;
  interviewer_id?: string | null;
  mode: string;
  status: RecruitmentInterviewStatus;
  result: RecruitmentInterviewResult;
  rating?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type UpcomingInterview = {
  id: string;
  scheduled_at: string;
  mode: string;
  interviewer_id?: string | null;
  interviewer_name?: string | null;
  candidate: {
    id: string;
    name: string;
    phone: string;
    intended_job_id?: string | null;
    source_type: RecruitmentSourceType;
    company_id: string;
  };
};

export type RecruitmentSettings = {
  id: string;
  company_id: string;
  overdue_invite_days: number;
  overdue_followup_days: number;
};

export type RecruitmentDashboard = {
  gap_overview: {
    total_gap: number;
    jobs: { job: RecruitmentJob; headcount: number; offered: number; gap: number }[];
  };
  urgent_jobs: { job: RecruitmentJob; headcount: number; offered: number; gap: number; urgent_by_priority: boolean; urgent_by_rule: boolean }[];
  daily_leads: { day: string; posting_id?: string | null; job_id?: string | null; count: number }[];
  campaign_reports: { campaign: RecruitmentCampaign; leads: number; interviews: number; offers: number }[];
  platform_effectiveness: { posting_id: string; platform: string; job_id: string; leads: number; interviews: number; offers: number }[];
  overdue: { count: number; candidates: RecruitmentCandidate[] };
};

export type RecruitmentKpiMetric = "daily_posts" | "daily_new_group_owners" | "daily_contacts";

export type RecruitmentKpiTarget = {
  id: string;
  company_id: string;
  company_name?: string | null;
  assignee_employee_id: string;
  assignee_name?: string | null;
  metric: RecruitmentKpiMetric;
  platform?: string | null;
  period: "daily" | "weekly" | "monthly";
  target_count: number;
  period_start: string;
  period_end: string;
  period_days_left: number;
  target_per_day: number;
  effective_from: string;
  effective_to?: string | null;
  issued_by_source: "ifm" | "bh";
  issued_by_ifm_user?: string | null;
  issued_by_employee_id?: string | null;
  issued_by_name?: string | null;
  note?: string | null;
  active: boolean;
  actual?: number;
  completion_rate?: number | null;
  created_at: string;
  updated_at: string;
};

export type RecruitmentGroupOwner = {
  id: string;
  company_id: string;
  company_name?: string | null;
  platform: string;
  group_name: string;
  owner_name?: string | null;
  owner_contact?: string | null;
  group_url?: string | null;
  member_count?: number | null;
  found_by: string;
  found_by_name?: string | null;
  found_on: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type IfmCompanyCache = {
  ifm_company_id: string;
  name: string;
  active: boolean;
  synced_at: string;
  bh_company_id?: string | null;
  bh_company_name?: string | null;
};

export type IfmUserBinding = {
  id: string;
  ifm_user_id: string;
  ifm_display_name?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  bridge_role: "manager" | "operator";
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecruitmentAnalytics = {
  platforms: {
    platform: string;
    leads: number;
    interviews: number;
    offers: number;
    cost: number;
    postings: number;
    cost_per_lead: number | null;
    cost_per_offer: number | null;
    paid_leads: number;
    free_leads: number;
  }[];
  materials: {
    material_id: string;
    title: string;
    type: string;
    leads: number;
    interviews: number;
    offers: number;
  }[];
  locations: {
    location: string;
    leads: number;
    interviews: number;
    offers: number;
    cost: number;
    campaigns: number;
    cost_per_lead: number | null;
    cost_per_offer: number | null;
  }[];
  paid_vs_free: {
    group: "paid" | "free";
    leads: number;
    interviews: number;
    offers: number;
    cost: number;
  }[];
};

export type RecruitmentMaterialBody = {
  company_id?: string;
  job_id?: string;
  type?: RecruitmentMaterialType;
  title?: string;
  source_text?: string | null;
  tune_prompt?: string | null;
  text_content?: string | null;
  document_id?: string | null;
  platforms?: string[] | null;
  active?: boolean;
  ai_generated?: boolean;
};

export type RecruitmentCopyRequest = {
  company_id?: string;
  material_type?: RecruitmentMaterialType;
  tune_prompt?: string | null;
  job_title?: string | undefined;
  salary_min?: number | null | undefined;
  salary_max?: number | null | undefined;
  salary_note?: string | null | undefined;
  job_content?: string | null | undefined;
  requirements?: string | null | undefined;
  source_text?: unknown;
  copy_type?: string;
};

function qs(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const out = search.toString();
  return out ? `?${out}` : "";
}

async function apiForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : response.statusText;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const listRecruitmentIndustries = (params: Record<string, unknown> = {}) =>
  api<{ industries: RecruitmentIndustry[] }>(`/recruitment/industries${qs(params)}`);
export const createRecruitmentIndustry = (body: unknown) =>
  api<{ industry: RecruitmentIndustry }>("/recruitment/industries", { method: "POST", body });
export const updateRecruitmentIndustry = (id: string, body: unknown) =>
  api<{ industry: RecruitmentIndustry }>(`/recruitment/industries/${id}`, { method: "PATCH", body });

export const listRecruitmentPlatforms = (params: Record<string, unknown> = {}) =>
  api<{ platforms: RecruitmentPlatform[] }>(`/recruitment/platforms${qs(params)}`);
export const createRecruitmentPlatform = (body: { company_id: string; name: string }) =>
  api<{ platform: RecruitmentPlatform }>("/recruitment/platforms", { method: "POST", body });
export const listRecruitmentPromptTemplates = (params: Record<string, unknown> = {}) =>
  api<{ prompt_templates: RecruitmentPromptTemplate[] }>(`/recruitment/prompt-templates${qs(params)}`);
export const updateRecruitmentPromptTemplate = (id: string, body: { base_prompt: string }) =>
  api<{ prompt_template: RecruitmentPromptTemplate }>(`/recruitment/prompt-templates/${id}`, { method: "PATCH", body });

export const listRecruitmentJobs = (params: Record<string, unknown> = {}) =>
  api<{ jobs: RecruitmentJob[] }>(`/recruitment/jobs${qs(params)}`);
export const createRecruitmentJob = (body: unknown) =>
  api<{ job: RecruitmentJob }>("/recruitment/jobs", { method: "POST", body });
export const getRecruitmentJob = (id: string) =>
  api<{ job: RecruitmentJob; materials: RecruitmentMaterial[]; postings: RecruitmentPosting[]; campaigns: RecruitmentCampaign[]; summary: { offered: number; gap: number; funnel: { status: RecruitmentCandidateStatus; count: number }[] } }>(`/recruitment/jobs/${id}`);
export const updateRecruitmentJob = (id: string, body: unknown) =>
  api<{ job: RecruitmentJob }>(`/recruitment/jobs/${id}`, { method: "PATCH", body });

export const createRecruitmentMaterial = (body: RecruitmentMaterialBody | FormData) =>
  body instanceof FormData
    ? apiForm<{ material: RecruitmentMaterial }>("/recruitment/materials", body)
    : api<{ material: RecruitmentMaterial }>("/recruitment/materials", { method: "POST", body });
export const updateRecruitmentMaterial = (id: string, body: RecruitmentMaterialBody | FormData) =>
  body instanceof FormData
    ? apiForm<{ material: RecruitmentMaterial }>(`/recruitment/materials/${id}`, body)
    : api<{ material: RecruitmentMaterial }>(`/recruitment/materials/${id}`, { method: "PATCH", body });
export const deleteRecruitmentMaterial = (id: string) =>
  api<null>(`/recruitment/materials/${id}`, { method: "DELETE" });
export const generateRecruitmentCopy = (body: RecruitmentCopyRequest) =>
  api<{ draft: string; model: string }>("/recruitment/materials/ai-copy", { method: "POST", body });

export const listRecruitmentPostings = (params: Record<string, unknown> = {}) =>
  api<{ postings: RecruitmentPosting[] }>(`/recruitment/postings${qs(params)}`);
export const createRecruitmentPosting = (body: unknown) =>
  api<{ posting: RecruitmentPosting }>("/recruitment/postings", { method: "POST", body });
export const updateRecruitmentPosting = (id: string, body: unknown) =>
  api<{ posting: RecruitmentPosting }>(`/recruitment/postings/${id}`, { method: "PATCH", body });
export const uploadRecruitmentPostingScreenshot = (id: string, file: File) => {
  const data = new FormData();
  data.set("file", file);
  return apiForm<{ posting: RecruitmentPosting }>(`/recruitment/postings/${id}/screenshot`, data);
};

export const listRecruitmentCampaigns = (params: Record<string, unknown> = {}) =>
  api<{ campaigns: RecruitmentCampaign[] }>(`/recruitment/campaigns${qs(params)}`);
export const createRecruitmentCampaign = (body: unknown) =>
  api<{ campaign: RecruitmentCampaign }>("/recruitment/campaigns", { method: "POST", body });
export const getRecruitmentCampaign = (id: string) =>
  api<{ campaign: RecruitmentCampaign; jobs: RecruitmentJob[]; materials: RecruitmentMaterial[]; candidates: RecruitmentCandidate[] }>(`/recruitment/campaigns/${id}`);
export const updateRecruitmentCampaign = (id: string, body: unknown) =>
  api<{ campaign: RecruitmentCampaign }>(`/recruitment/campaigns/${id}`, { method: "PATCH", body });

export const getRecruitmentAnalytics = (params: { job_id?: string } = {}) =>
  api<{ analytics: RecruitmentAnalytics }>(`/recruitment/analytics${qs(params)}`);

export const listRecruitmentCandidates = (params: Record<string, unknown> = {}) =>
  api<{ candidates: RecruitmentCandidate[] }>(`/recruitment/candidates${qs(params)}`);
export const createRecruitmentCandidate = (body: unknown | FormData) =>
  body instanceof FormData
    ? apiForm<{ candidate: RecruitmentCandidate }>("/recruitment/candidates", body)
    : api<{ candidate: RecruitmentCandidate }>("/recruitment/candidates", { method: "POST", body });
export const getRecruitmentCandidate = (id: string) =>
  api<{ candidate: RecruitmentCandidate; resume_document?: { id: string; storage_path: string; filename: string; mime?: string | null } | null; followups: RecruitmentFollowup[]; interviews: RecruitmentInterview[] }>(`/recruitment/candidates/${id}`);
export const updateRecruitmentCandidate = (id: string, body: unknown) =>
  api<{ candidate: RecruitmentCandidate }>(`/recruitment/candidates/${id}`, { method: "PATCH", body });
export const createRecruitmentFollowup = (candidateId: string, body: unknown) =>
  api<{ followup: RecruitmentFollowup }>(`/recruitment/candidates/${candidateId}/followups`, { method: "POST", body });

export const createRecruitmentInterview = (body: unknown) =>
  api<{ interview: RecruitmentInterview }>("/recruitment/interviews", { method: "POST", body });
export const updateRecruitmentInterview = (id: string, body: unknown) =>
  api<{ interview: RecruitmentInterview }>(`/recruitment/interviews/${id}`, { method: "PATCH", body });
export const listUpcomingInterviews = () =>
  api<{ interviews: UpcomingInterview[] }>("/recruitment/interviews/upcoming");

export const listRecruitmentSettings = () =>
  api<{ settings: RecruitmentSettings[] }>("/recruitment/settings");
export const updateRecruitmentSettings = (id: string, body: unknown) =>
  api<{ settings: RecruitmentSettings }>(`/recruitment/settings/${id}`, { method: "PATCH", body });
export const getRecruitmentDashboard = () =>
  api<{ dashboard: RecruitmentDashboard }>("/recruitment/dashboard");

export type RecruitmentAssignableEmployee = {
  id: string;
  name: string;
  position_name?: string | null;
  is_recruitment_operator: boolean;
};
// 指标执行人候选（招聘操作员是内部员工，不走 /employees 的公司范围过滤）
export const listRecruitmentAssignableEmployees = () =>
  api<{ employees: RecruitmentAssignableEmployee[] }>("/recruitment/assignable-employees");

export const listRecruitmentKpiTargets = (params: Record<string, unknown> = {}) =>
  api<{ kpi_targets: RecruitmentKpiTarget[] }>(`/recruitment/kpi-targets${qs(params)}`);
export const listMyRecruitmentKpiTargets = (params: Record<string, unknown> = {}) =>
  api<{ date: string; kpi_targets: RecruitmentKpiTarget[] }>(`/recruitment/kpi-targets/my${qs(params)}`);
export const createRecruitmentKpiTarget = (body: unknown) =>
  api<{ kpi_target: RecruitmentKpiTarget }>("/recruitment/kpi-targets", { method: "POST", body });
export const updateRecruitmentKpiTarget = (id: string, body: unknown) =>
  api<{ kpi_target: RecruitmentKpiTarget }>(`/recruitment/kpi-targets/${id}`, { method: "PATCH", body });
export const deleteRecruitmentKpiTarget = (id: string) =>
  api<{ kpi_target: RecruitmentKpiTarget }>(`/recruitment/kpi-targets/${id}`, { method: "DELETE" });

export const listRecruitmentGroupOwners = (params: Record<string, unknown> = {}) =>
  api<{ group_owners: RecruitmentGroupOwner[] }>(`/recruitment/group-owners${qs(params)}`);
export const createRecruitmentGroupOwner = (body: unknown) =>
  api<{ group_owner: RecruitmentGroupOwner }>("/recruitment/group-owners", { method: "POST", body });
export const updateRecruitmentGroupOwner = (id: string, body: unknown) =>
  api<{ group_owner: RecruitmentGroupOwner }>(`/recruitment/group-owners/${id}`, { method: "PATCH", body });
export const deleteRecruitmentGroupOwner = (id: string) =>
  api<null>(`/recruitment/group-owners/${id}`, { method: "DELETE" });

export const listIfmBindableCompanies = () =>
  api<{ companies: { id: string; name: string }[] }>("/recruitment/ifm/companies");
export const listIfmCompaniesCache = () =>
  api<{ companies_cache: IfmCompanyCache[] }>("/recruitment/ifm/companies-cache");
export const bindIfmCompany = (ifmCompanyId: string, companyId: string | null) =>
  api<{ ok: true }>(`/recruitment/ifm/companies-cache/${encodeURIComponent(ifmCompanyId)}/bind`, {
    method: "POST",
    body: { companyId }
  });
export const createCompanyFromIfmCache = (ifmCompanyId: string) =>
  api<{ company: { id: string; name: string; ifm_company_id: string | null } }>(
    `/recruitment/ifm/companies-cache/${encodeURIComponent(ifmCompanyId)}/create-company`,
    { method: "POST" }
  );

export const listIfmUserBindings = () =>
  api<{ user_bindings: IfmUserBinding[] }>("/recruitment/ifm/user-bindings");
export const createIfmUserBinding = (body: unknown) =>
  api<{ user_binding: IfmUserBinding }>("/recruitment/ifm/user-bindings", { method: "POST", body });
export const updateIfmUserBinding = (id: string, body: unknown) =>
  api<{ user_binding: IfmUserBinding }>(`/recruitment/ifm/user-bindings/${id}`, { method: "PATCH", body });

export type OperatorComparisonEntry = {
  employee_id: string;
  name: string;
  ifm_display_name: string | null;
  volume: {
    postings: number;
    contacts: number;
    new_group_owners: number;
    candidates_added: number;
    interviews_created: number;
  };
  kpi: {
    target_days: number;
    met_days: number;
    met_ratio: number | null;
    avg_completion_rate: number | null;
  };
  funnel: {
    candidates_added: number;
    reached_interview: number;
    interview_rate: number | null;
    interviews_concluded: { done: number; no_show: number; cancelled: number };
    show_rate: number | null;
    results: { pass: number; fail: number };
    pass_rate: number | null;
    offered: number;
    offer_rate: number | null;
  };
  active_days: number;
};

export const getOperatorComparison = (params: { from?: string; to?: string } = {}) => {
  const searchParams = new URLSearchParams();
  if (params.from) searchParams.set("from", params.from);
  if (params.to) searchParams.set("to", params.to);
  const query = searchParams.toString();
  return api<{ from: string; to: string; operators: OperatorComparisonEntry[] }>(
    `/recruitment/operator-comparison${query ? `?${query}` : ""}`
  );
};
