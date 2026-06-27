ALTER TABLE "commission_entries" ADD COLUMN "milestone_seq" integer;--> statement-breakpoint
ALTER TABLE "external_commission_entries" ADD COLUMN "milestone_seq" integer;--> statement-breakpoint
ALTER TABLE "scheme_lines" ADD COLUMN "milestone_split" jsonb;