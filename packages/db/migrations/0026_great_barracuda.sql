CREATE TYPE "public"."recruitment_campaign_status" AS ENUM('planned', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recruitment_campaign_type" AS ENUM('roadshow', 'flyer', 'booth', 'other');--> statement-breakpoint
CREATE TYPE "public"."recruitment_candidate_status" AS ENUM('new', 'invited', 'interview_scheduled', 'interviewed', 'offered', 'rejected', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."recruitment_followup_type" AS ENUM('call', 'message', 'invite', 'note');--> statement-breakpoint
CREATE TYPE "public"."recruitment_interview_result" AS ENUM('pending', 'pass', 'fail');--> statement-breakpoint
CREATE TYPE "public"."recruitment_interview_status" AS ENUM('scheduled', 'done', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recruitment_job_priority" AS ENUM('normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."recruitment_job_status" AS ENUM('open', 'paused', 'filled', 'closed');--> statement-breakpoint
CREATE TYPE "public"."recruitment_material_type" AS ENUM('copy', 'image', 'flyer', 'stand');--> statement-breakpoint
CREATE TYPE "public"."recruitment_posting_status" AS ENUM('publishing', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."recruitment_source_type" AS ENUM('posting', 'campaign', 'walk_in', 'referral');--> statement-breakpoint
CREATE TABLE "recruitment_campaign_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_campaign_jobs_campaign_job_unique" UNIQUE("campaign_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "recruitment_campaign_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_campaign_materials_campaign_material_unique" UNIQUE("campaign_id","material_id")
);
--> statement-breakpoint
CREATE TABLE "recruitment_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "recruitment_campaign_type" NOT NULL,
	"status" "recruitment_campaign_status" DEFAULT 'planned' NOT NULL,
	"location" varchar(255) NOT NULL,
	"planned_date" date NOT NULL,
	"planned_start" time NOT NULL,
	"planned_end" time NOT NULL,
	"actual_date" date,
	"owner_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"phone" varchar(64) NOT NULL,
	"nationality" varchar(80),
	"photo_document_id" uuid,
	"resume_document_id" uuid,
	"source_type" "recruitment_source_type" NOT NULL,
	"source_posting_id" uuid,
	"source_campaign_id" uuid,
	"intended_job_id" uuid,
	"status" "recruitment_candidate_status" DEFAULT 'new' NOT NULL,
	"assigned_clerk_id" uuid,
	"in_talent_pool" boolean DEFAULT false NOT NULL,
	"reusable_later" boolean DEFAULT false NOT NULL,
	"reusable_note" varchar(255),
	"last_contacted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"by_employee_id" uuid NOT NULL,
	"type" "recruitment_followup_type" NOT NULL,
	"note" text NOT NULL,
	"contacted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_industries_company_name_unique" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "recruitment_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"interviewer_id" uuid,
	"mode" varchar(80) NOT NULL,
	"status" "recruitment_interview_status" DEFAULT 'scheduled' NOT NULL,
	"result" "recruitment_interview_result" DEFAULT 'pending' NOT NULL,
	"rating" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"salary_min" integer,
	"salary_max" integer,
	"salary_note" varchar(200),
	"job_content" text,
	"requirements" text,
	"nationalities" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "recruitment_job_status" DEFAULT 'open' NOT NULL,
	"priority" "recruitment_job_priority" DEFAULT 'normal' NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"type" "recruitment_material_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"text_content" text,
	"document_id" uuid,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"platform" varchar(120) NOT NULL,
	"copy_material_id" uuid,
	"image_material_id" uuid,
	"published_on" date NOT NULL,
	"status" "recruitment_posting_status" DEFAULT 'publishing' NOT NULL,
	"owner_id" uuid NOT NULL,
	"inquiry_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"overdue_invite_days" integer DEFAULT 2 NOT NULL,
	"overdue_followup_days" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_settings_company_unique" UNIQUE("company_id")
);
--> statement-breakpoint
ALTER TABLE "recruitment_campaign_jobs" ADD CONSTRAINT "recruitment_campaign_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaign_jobs" ADD CONSTRAINT "recruitment_campaign_jobs_campaign_id_recruitment_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."recruitment_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaign_jobs" ADD CONSTRAINT "recruitment_campaign_jobs_job_id_recruitment_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."recruitment_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaign_materials" ADD CONSTRAINT "recruitment_campaign_materials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaign_materials" ADD CONSTRAINT "recruitment_campaign_materials_campaign_id_recruitment_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."recruitment_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaign_materials" ADD CONSTRAINT "recruitment_campaign_materials_material_id_recruitment_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."recruitment_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaigns" ADD CONSTRAINT "recruitment_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaigns" ADD CONSTRAINT "recruitment_campaigns_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_photo_document_id_documents_id_fk" FOREIGN KEY ("photo_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_resume_document_id_documents_id_fk" FOREIGN KEY ("resume_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_source_posting_id_recruitment_postings_id_fk" FOREIGN KEY ("source_posting_id") REFERENCES "public"."recruitment_postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_source_campaign_id_recruitment_campaigns_id_fk" FOREIGN KEY ("source_campaign_id") REFERENCES "public"."recruitment_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_intended_job_id_recruitment_jobs_id_fk" FOREIGN KEY ("intended_job_id") REFERENCES "public"."recruitment_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_assigned_clerk_id_employees_id_fk" FOREIGN KEY ("assigned_clerk_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_followups" ADD CONSTRAINT "recruitment_followups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_followups" ADD CONSTRAINT "recruitment_followups_candidate_id_recruitment_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."recruitment_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_followups" ADD CONSTRAINT "recruitment_followups_by_employee_id_employees_id_fk" FOREIGN KEY ("by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_industries" ADD CONSTRAINT "recruitment_industries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_interviews" ADD CONSTRAINT "recruitment_interviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_interviews" ADD CONSTRAINT "recruitment_interviews_candidate_id_recruitment_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."recruitment_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_interviews" ADD CONSTRAINT "recruitment_interviews_interviewer_id_employees_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_jobs" ADD CONSTRAINT "recruitment_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_jobs" ADD CONSTRAINT "recruitment_jobs_industry_id_recruitment_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."recruitment_industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_jobs" ADD CONSTRAINT "recruitment_jobs_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_materials" ADD CONSTRAINT "recruitment_materials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_materials" ADD CONSTRAINT "recruitment_materials_job_id_recruitment_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."recruitment_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_materials" ADD CONSTRAINT "recruitment_materials_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD CONSTRAINT "recruitment_postings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD CONSTRAINT "recruitment_postings_job_id_recruitment_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."recruitment_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD CONSTRAINT "recruitment_postings_copy_material_id_recruitment_materials_id_fk" FOREIGN KEY ("copy_material_id") REFERENCES "public"."recruitment_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD CONSTRAINT "recruitment_postings_image_material_id_recruitment_materials_id_fk" FOREIGN KEY ("image_material_id") REFERENCES "public"."recruitment_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD CONSTRAINT "recruitment_postings_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_settings" ADD CONSTRAINT "recruitment_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;