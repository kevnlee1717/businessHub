ALTER TABLE "recruitment_candidates" ADD COLUMN IF NOT EXISTS "ethnicity" text;
--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD COLUMN IF NOT EXISTS "age_band" text;
--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD COLUMN IF NOT EXISTS "experience_level" text;
