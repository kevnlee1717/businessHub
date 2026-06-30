DO $$ BEGIN
 CREATE TYPE "bank_account_type" AS ENUM('bank_card', 'sg_corporate', 'alipay', 'wechat');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "type" "bank_account_type";
