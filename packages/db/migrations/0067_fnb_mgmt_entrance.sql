ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "mgmt_pct" numeric(8, 2) DEFAULT '3' NOT NULL;--> statement-breakpoint
ALTER TABLE "fnb_food_courts" ADD COLUMN IF NOT EXISTS "entrance_monthly" numeric(12, 2);--> statement-breakpoint
UPDATE "fnb_food_courts"
SET "entrance_monthly" = ROUND("entrance_total" / "entrance_months", 2)
WHERE "entrance_monthly" IS NULL AND "entrance_months" IS NOT NULL AND "entrance_months" > 0;
