import { sql } from "drizzle-orm";
import { boolean, date, integer, pgTable, text, time, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { documents } from "./documents";
import { employees } from "./employees";
import {
  recruitmentCampaignStatusEnum,
  recruitmentCampaignTypeEnum,
  recruitmentCandidateStatusEnum,
  recruitmentFollowupTypeEnum,
  recruitmentInterviewResultEnum,
  recruitmentInterviewStatusEnum,
  recruitmentJobPriorityEnum,
  recruitmentJobStatusEnum,
  recruitmentMaterialTypeEnum,
  recruitmentPostingStatusEnum,
  recruitmentSourceTypeEnum
} from "./enums";

export const recruitmentIndustries = pgTable(
  "recruitment_industries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("recruitment_industries_company_name_unique").on(table.companyId, table.name)]
);

export const recruitmentJobs = pgTable("recruitment_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  industryId: uuid("industry_id").notNull().references(() => recruitmentIndustries.id),
  title: varchar("title", { length: 200 }).notNull(),
  headcount: integer("headcount").notNull().default(1),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryNote: varchar("salary_note", { length: 200 }),
  jobContent: text("job_content"),
  requirements: text("requirements"),
  nationalities: text("nationalities").array().notNull().default(sql`ARRAY[]::text[]`),
  status: recruitmentJobStatusEnum("status").notNull().default("open"),
  priority: recruitmentJobPriorityEnum("priority").notNull().default("normal"),
  ownerId: uuid("owner_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recruitmentMaterials = pgTable("recruitment_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => recruitmentJobs.id, { onDelete: "cascade" }),
  type: recruitmentMaterialTypeEnum("type").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  textContent: text("text_content"),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recruitmentPostings = pgTable("recruitment_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => recruitmentJobs.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 120 }).notNull(),
  copyMaterialId: uuid("copy_material_id").references(() => recruitmentMaterials.id, { onDelete: "set null" }),
  imageMaterialId: uuid("image_material_id").references(() => recruitmentMaterials.id, { onDelete: "set null" }),
  publishedOn: date("published_on").notNull(),
  status: recruitmentPostingStatusEnum("status").notNull().default("publishing"),
  ownerId: uuid("owner_id").notNull().references(() => employees.id),
  inquiryCount: integer("inquiry_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recruitmentCampaigns = pgTable("recruitment_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  type: recruitmentCampaignTypeEnum("type").notNull(),
  status: recruitmentCampaignStatusEnum("status").notNull().default("planned"),
  location: varchar("location", { length: 255 }).notNull(),
  plannedDate: date("planned_date").notNull(),
  plannedStart: time("planned_start").notNull(),
  plannedEnd: time("planned_end").notNull(),
  actualDate: date("actual_date"),
  ownerId: uuid("owner_id").notNull().references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recruitmentCampaignJobs = pgTable(
  "recruitment_campaign_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => recruitmentCampaigns.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => recruitmentJobs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("recruitment_campaign_jobs_campaign_job_unique").on(table.campaignId, table.jobId)]
);

export const recruitmentCampaignMaterials = pgTable(
  "recruitment_campaign_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => recruitmentCampaigns.id, { onDelete: "cascade" }),
    materialId: uuid("material_id").notNull().references(() => recruitmentMaterials.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("recruitment_campaign_materials_campaign_material_unique").on(table.campaignId, table.materialId)
  ]
);

export const recruitmentCandidates = pgTable("recruitment_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 64 }).notNull(),
  nationality: varchar("nationality", { length: 80 }),
  photoDocumentId: uuid("photo_document_id").references(() => documents.id, { onDelete: "set null" }),
  resumeDocumentId: uuid("resume_document_id").references(() => documents.id, { onDelete: "set null" }),
  sourceType: recruitmentSourceTypeEnum("source_type").notNull(),
  sourcePostingId: uuid("source_posting_id").references(() => recruitmentPostings.id, { onDelete: "set null" }),
  sourceCampaignId: uuid("source_campaign_id").references(() => recruitmentCampaigns.id, { onDelete: "set null" }),
  intendedJobId: uuid("intended_job_id").references(() => recruitmentJobs.id, { onDelete: "set null" }),
  status: recruitmentCandidateStatusEnum("status").notNull().default("new"),
  assignedClerkId: uuid("assigned_clerk_id").references(() => employees.id, { onDelete: "set null" }),
  inTalentPool: boolean("in_talent_pool").notNull().default(false),
  reusableLater: boolean("reusable_later").notNull().default(false),
  reusableNote: varchar("reusable_note", { length: 255 }),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recruitmentFollowups = pgTable("recruitment_followups", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => recruitmentCandidates.id, { onDelete: "cascade" }),
  byEmployeeId: uuid("by_employee_id").notNull().references(() => employees.id),
  type: recruitmentFollowupTypeEnum("type").notNull(),
  note: text("note").notNull(),
  contactedAt: timestamp("contacted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recruitmentInterviews = pgTable("recruitment_interviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => recruitmentCandidates.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  interviewerId: uuid("interviewer_id").references(() => employees.id, { onDelete: "set null" }),
  mode: varchar("mode", { length: 80 }).notNull(),
  status: recruitmentInterviewStatusEnum("status").notNull().default("scheduled"),
  result: recruitmentInterviewResultEnum("result").notNull().default("pending"),
  rating: integer("rating"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recruitmentSettings = pgTable(
  "recruitment_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    overdueInviteDays: integer("overdue_invite_days").notNull().default(2),
    overdueFollowupDays: integer("overdue_followup_days").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("recruitment_settings_company_unique").on(table.companyId)]
);
