ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "investor_share_pct" numeric(8, 2) DEFAULT '51' NOT NULL;--> statement-breakpoint
ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "couple_floor" numeric(12, 2) DEFAULT '3000' NOT NULL;--> statement-breakpoint
ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "couple_repay_cap" numeric(12, 2) DEFAULT '4167' NOT NULL;--> statement-breakpoint
ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "excess_mgmt_pct" numeric(8, 2) DEFAULT '50' NOT NULL;--> statement-breakpoint
ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "excess_couple_pct" numeric(8, 2) DEFAULT '25' NOT NULL;
