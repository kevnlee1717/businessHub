-- 招聘指标周期粒度：daily(默认,兼容存量)/weekly/monthly
-- target_per_day 列名保留，语义变为「每周期目标数」
ALTER TABLE "recruitment_kpi_targets" ADD COLUMN IF NOT EXISTS "period" text DEFAULT 'daily' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "recruitment_kpi_targets"
    ADD CONSTRAINT "recruitment_kpi_targets_period_check" CHECK ("period" IN ('daily', 'weekly', 'monthly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
