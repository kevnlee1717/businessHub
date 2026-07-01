import { z } from "zod";
import {
  recruitmentCampaignStatuses,
  recruitmentCampaignTypes,
  recruitmentCandidateStatuses,
  recruitmentFollowupTypes,
  recruitmentInterviewResults,
  recruitmentInterviewStatuses,
  recruitmentJobPriorities,
  recruitmentJobStatuses,
  recruitmentMaterialTypes,
  recruitmentPostingStatuses,
  recruitmentSourceTypes
} from "../enums";

const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const optionalUuid = uuidField.optional();
const nullableOptionalUuid = uuidField.nullable().optional();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const booleanQuery = z.enum(["0", "1", "true", "false"]).optional();
const bilingualText = z.string().nullable().optional();
const sourceLang = z.enum(["zh", "en"]).optional();
const numericInput = z.union([z.number(), z.string()]).nullish();

export const recruitmentIndustryCreateSchema = z.object({
  company_id: uuidField,
  name: z.string().trim().min(1).max(120),
  nameZh: bilingualText,
  nameEn: bilingualText,
  sourceLang,
  nameSourceLang: sourceLang,
  sort_order: z.number().int().optional(),
  active: z.boolean().optional()
});

export const recruitmentIndustryUpdateSchema = recruitmentIndustryCreateSchema.omit({ company_id: true }).partial();

export const recruitmentIndustryListQuerySchema = z.object({
  active: booleanQuery,
  q: optionalText
});

export const recruitmentPlatformCreateSchema = z.object({
  company_id: uuidField,
  name: z.string().trim().min(1).max(120)
});

export const recruitmentPlatformListQuerySchema = z.object({
  company_id: optionalUuid,
  active: booleanQuery
});

export const recruitmentPromptTemplateListQuerySchema = z.object({
  company_id: optionalUuid
});

export const recruitmentPromptTemplateUpdateSchema = z.object({
  base_prompt: z.string()
});

const recruitmentJobBaseSchema = z.object({
  industry_id: nullableOptionalUuid,
  title: z.string().trim().min(1).max(200),
  titleZh: bilingualText,
  titleEn: bilingualText,
  titleSourceLang: sourceLang,
  headcount: z.number().int().min(1).optional(),
  salary_min: z.number().int().min(0).nullable().optional(),
  salary_max: z.number().int().min(0).nullable().optional(),
  pt_salary_min: z.number().min(0).nullable().optional(),
  pt_salary_max: z.number().min(0).nullable().optional(),
  employment_types: z.array(z.enum(["full_time", "part_time"])).min(1).optional(),
  salary_note: z.string().trim().min(1).max(200).nullable().optional(),
  salaryNoteZh: bilingualText,
  salaryNoteEn: bilingualText,
  salaryNoteSourceLang: sourceLang,
  job_content: nullableOptionalText,
  jobContentZh: bilingualText,
  jobContentEn: bilingualText,
  jobContentSourceLang: sourceLang,
  requirements: nullableOptionalText,
  requirementsZh: bilingualText,
  requirementsEn: bilingualText,
  requirementsSourceLang: sourceLang,
  sourceLang,
  nationalities: z.array(z.string().trim().min(1)).optional(),
  status: z.enum(recruitmentJobStatuses).optional(),
  priority: z.enum(recruitmentJobPriorities).optional(),
  owner_id: nullableOptionalUuid
});

export const recruitmentJobCreateSchema = recruitmentJobBaseSchema.extend({
  company_id: uuidField
});

export const recruitmentJobUpdateSchema = recruitmentJobBaseSchema.partial();

export const recruitmentJobListQuerySchema = z.object({
  industry_id: optionalUuid,
  status: z.enum(recruitmentJobStatuses).optional(),
  priority: z.enum(recruitmentJobPriorities).optional(),
  q: optionalText
});

const recruitmentMaterialBaseSchema = z.object({
  job_id: uuidField,
  type: z.enum(recruitmentMaterialTypes),
  title: z.string().trim().min(1).max(200),
  source_text: nullableOptionalText,
  tune_prompt: z.string().nullish(),
  text_content: nullableOptionalText,
  document_id: nullableOptionalUuid,
  platforms: z.array(z.string().trim().min(1)).nullable().optional(),
  active: z.boolean().optional(),
  ai_generated: z.boolean().optional()
});

export const recruitmentMaterialCreateSchema = recruitmentMaterialBaseSchema.extend({
  company_id: uuidField
});

export const recruitmentMaterialUpdateSchema = recruitmentMaterialBaseSchema.partial();

export const recruitmentMaterialListQuerySchema = z.object({
  job_id: optionalUuid,
  type: z.enum(recruitmentMaterialTypes).optional()
});

export const recruitmentAiCopySchema = z.object({
  company_id: optionalUuid,
  industry: optionalText,
  job_title: z.string().trim().min(1),
  salary_min: z.number().int().min(0).nullable().optional(),
  salary_max: z.number().int().min(0).nullable().optional(),
  salary_note: nullableOptionalText,
  job_content: nullableOptionalText,
  requirements: nullableOptionalText,
  source_text: nullableOptionalText,
  tune_prompt: z.string().nullish(),
  material_type: z.enum(recruitmentMaterialTypes).optional(),
  copy_type: z.enum(["ad", "job_description", "invite_script"]),
  tone: optionalText,
  platform: optionalText
});

const recruitmentPostingBaseSchema = z.object({
  job_id: uuidField,
  platform: z.string().trim().min(1).max(120),
  copy_material_id: nullableOptionalUuid,
  image_material_id: nullableOptionalUuid,
  share_url: z.string().trim().max(1024).nullable().optional(),
  published_on: dateString,
  is_paid: z.boolean().optional(),
  cost: numericInput,
  status: z.enum(recruitmentPostingStatuses).optional(),
  owner_id: uuidField,
  invite_clerk_id: nullableOptionalUuid,
  inquiry_count: z.number().int().min(0).optional(),
  notes: nullableOptionalText
});

export const recruitmentPostingCreateSchema = recruitmentPostingBaseSchema.extend({
  company_id: uuidField
});

export const recruitmentPostingUpdateSchema = recruitmentPostingBaseSchema.partial();

export const recruitmentPostingListQuerySchema = z.object({
  job_id: optionalUuid,
  platform: optionalText,
  status: z.enum(recruitmentPostingStatuses).optional(),
  owner_id: optionalUuid
});

const recruitmentCampaignBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(recruitmentCampaignTypes),
  status: z.enum(recruitmentCampaignStatuses).optional(),
  location: z.string().trim().min(1).max(255),
  cost: numericInput,
  planned_date: dateString,
  planned_start: timeString,
  planned_end: timeString,
  actual_date: dateString.nullable().optional(),
  owner_id: uuidField,
  notes: nullableOptionalText,
  job_ids: z.array(uuidField).optional(),
  material_ids: z.array(uuidField).optional()
});

export const recruitmentCampaignCreateSchema = recruitmentCampaignBaseSchema.extend({
  company_id: uuidField
});

export const recruitmentCampaignUpdateSchema = recruitmentCampaignBaseSchema.partial();

export const recruitmentCampaignListQuerySchema = z.object({
  status: z.enum(recruitmentCampaignStatuses).optional(),
  type: z.enum(recruitmentCampaignTypes).optional()
});

export const recruitmentAnalyticsQuerySchema = z.object({
  job_id: optionalUuid,
  company_id: optionalUuid
});

const recruitmentCandidateBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(64),
  nationality: z.string().trim().min(1).max(80).nullable().optional(),
  ethnicity: z.string().nullish(),
  age_band: z.string().nullish(),
  experience_level: z.string().nullish(),
  photo_document_id: nullableOptionalUuid,
  resume_document_id: nullableOptionalUuid,
  source_type: z.enum(recruitmentSourceTypes),
  source_posting_id: nullableOptionalUuid,
  source_campaign_id: nullableOptionalUuid,
  intended_job_id: nullableOptionalUuid,
  status: z.enum(recruitmentCandidateStatuses).optional(),
  assigned_clerk_id: nullableOptionalUuid,
  in_talent_pool: z.boolean().optional(),
  reusable_later: z.boolean().optional(),
  reusable_note: z.string().trim().min(1).max(255).nullable().optional(),
  last_contacted_at: z.string().datetime().nullable().optional(),
  notes: nullableOptionalText
});

export const recruitmentCandidateCreateSchema = recruitmentCandidateBaseSchema.extend({
  company_id: uuidField
});

export const recruitmentCandidateUpdateSchema = recruitmentCandidateBaseSchema.partial();

export const recruitmentCandidateListQuerySchema = z.object({
  status: z.enum(recruitmentCandidateStatuses).optional(),
  intended_job_id: optionalUuid,
  source_type: z.enum(recruitmentSourceTypes).optional(),
  assigned_clerk_id: optionalUuid,
  overdue: booleanQuery,
  in_talent_pool: booleanQuery
});

export const recruitmentFollowupCreateSchema = z.object({
  company_id: uuidField,
  candidate_id: uuidField.optional(),
  by_employee_id: uuidField,
  type: z.enum(recruitmentFollowupTypes),
  note: z.string().trim().min(1),
  contacted_at: z.string().datetime().optional()
});

const recruitmentInterviewBaseSchema = z.object({
  candidate_id: uuidField,
  scheduled_at: z.string().datetime(),
  interviewer_id: nullableOptionalUuid,
  mode: z.string().trim().min(1).max(80),
  status: z.enum(recruitmentInterviewStatuses).optional(),
  result: z.enum(recruitmentInterviewResults).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: nullableOptionalText
});

export const recruitmentInterviewCreateSchema = recruitmentInterviewBaseSchema.extend({
  company_id: uuidField
});

export const recruitmentInterviewUpdateSchema = recruitmentInterviewBaseSchema.partial();

export const recruitmentSettingsUpdateSchema = z.object({
  overdue_invite_days: z.number().int().min(1).optional(),
  overdue_followup_days: z.number().int().min(1).optional()
});

export type RecruitmentIndustryCreateInput = z.infer<typeof recruitmentIndustryCreateSchema>;
export type RecruitmentIndustryUpdateInput = z.infer<typeof recruitmentIndustryUpdateSchema>;
export type RecruitmentIndustryListQuery = z.infer<typeof recruitmentIndustryListQuerySchema>;
export type RecruitmentJobCreateInput = z.infer<typeof recruitmentJobCreateSchema>;
export type RecruitmentJobUpdateInput = z.infer<typeof recruitmentJobUpdateSchema>;
export type RecruitmentJobListQuery = z.infer<typeof recruitmentJobListQuerySchema>;
export type RecruitmentMaterialCreateInput = z.infer<typeof recruitmentMaterialCreateSchema>;
export type RecruitmentMaterialUpdateInput = z.infer<typeof recruitmentMaterialUpdateSchema>;
export type RecruitmentMaterialListQuery = z.infer<typeof recruitmentMaterialListQuerySchema>;
export type RecruitmentAiCopyInput = z.infer<typeof recruitmentAiCopySchema>;
export type RecruitmentPostingCreateInput = z.infer<typeof recruitmentPostingCreateSchema>;
export type RecruitmentPostingUpdateInput = z.infer<typeof recruitmentPostingUpdateSchema>;
export type RecruitmentPostingListQuery = z.infer<typeof recruitmentPostingListQuerySchema>;
export type RecruitmentCampaignCreateInput = z.infer<typeof recruitmentCampaignCreateSchema>;
export type RecruitmentCampaignUpdateInput = z.infer<typeof recruitmentCampaignUpdateSchema>;
export type RecruitmentCampaignListQuery = z.infer<typeof recruitmentCampaignListQuerySchema>;
export type RecruitmentCandidateCreateInput = z.infer<typeof recruitmentCandidateCreateSchema>;
export type RecruitmentCandidateUpdateInput = z.infer<typeof recruitmentCandidateUpdateSchema>;
export type RecruitmentCandidateListQuery = z.infer<typeof recruitmentCandidateListQuerySchema>;
export type RecruitmentFollowupCreateInput = z.infer<typeof recruitmentFollowupCreateSchema>;
export type RecruitmentInterviewCreateInput = z.infer<typeof recruitmentInterviewCreateSchema>;
export type RecruitmentInterviewUpdateInput = z.infer<typeof recruitmentInterviewUpdateSchema>;
export type RecruitmentSettingsUpdateInput = z.infer<typeof recruitmentSettingsUpdateSchema>;
