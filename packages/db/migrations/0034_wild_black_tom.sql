ALTER TABLE "recruitment_jobs" ADD COLUMN "employment_types" text[] DEFAULT ARRAY['full_time']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_jobs" ADD COLUMN "pt_salary_min" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "recruitment_jobs" ADD COLUMN "pt_salary_max" numeric(6, 2);