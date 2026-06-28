ALTER TABLE "employees" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "permissions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "data_scope" "data_scope" DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_materials" ADD COLUMN IF NOT EXISTS "source_text" text;