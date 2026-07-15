ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "adv_mode" text DEFAULT 'pct' NOT NULL;--> statement-breakpoint
ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "mdr_mode" text DEFAULT 'pct' NOT NULL;
