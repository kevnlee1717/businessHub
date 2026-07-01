ALTER TABLE "recruitment_postings" ADD COLUMN IF NOT EXISTS "is_paid" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD COLUMN IF NOT EXISTS "cost" numeric(12,2);
--> statement-breakpoint
ALTER TABLE "recruitment_campaigns" ADD COLUMN IF NOT EXISTS "cost" numeric(12,2);
