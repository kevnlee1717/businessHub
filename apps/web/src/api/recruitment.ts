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
  candidates: (params?: unknown) => ["recruitment", "candidates", params] as const,
  candidate: (id: string) => ["recruitment", "candidate", id] as const,
  settings: () => ["recruitment", "settings"] as const
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

export const listRecruitmentSettings = () =>
  api<{ settings: RecruitmentSettings[] }>("/recruitment/settings");
export const updateRecruitmentSettings = (id: string, body: unknown) =>
  api<{ settings: RecruitmentSettings }>(`/recruitment/settings/${id}`, { method: "PATCH", body });
export const getRecruitmentDashboard = () =>
  api<{ dashboard: RecruitmentDashboard }>("/recruitment/dashboard");
