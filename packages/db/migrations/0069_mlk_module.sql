CREATE TABLE IF NOT EXISTS "mlk_investors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"uen" text,
	"id_no" text,
	"phone" text,
	"wechat" text,
	"address" text,
	"service_tier" text DEFAULT 'tier1' NOT NULL,
	"pr_status" text DEFAULT 'none' NOT NULL,
	"kyc_status" text DEFAULT 'pending' NOT NULL,
	"drive_folder_id" uuid,
	"notes" text,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mlk_couples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_company" text,
	"operator_uen" text,
	"husband_name" text NOT NULL,
	"husband_id_no" text,
	"husband_passport" text,
	"wife_name" text NOT NULL,
	"wife_id_no" text,
	"wife_passport" text,
	"phone" text,
	"wechat" text,
	"husband_ep" text DEFAULT 'none' NOT NULL,
	"wife_ep" text DEFAULT 'none' NOT NULL,
	"pr_status" text DEFAULT 'none' NOT NULL,
	"mentor_id" uuid REFERENCES "public"."mlk_couples"("id") ON DELETE set null ON UPDATE no action,
	"status" text DEFAULT 'candidate' NOT NULL,
	"joined_at" timestamp with time zone,
	"exited_at" timestamp with time zone,
	"drive_folder_id" uuid,
	"notes" text,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mlk_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stall" text,
	"address" text,
	"spv_name" text,
	"spv_uen" text,
	"investor_id" uuid REFERENCES "public"."mlk_investors"("id") ON DELETE set null ON UPDATE no action,
	"couple_id" uuid REFERENCES "public"."mlk_couples"("id") ON DELETE set null ON UPDATE no action,
	"food_court_id" uuid REFERENCES "public"."fnb_food_courts"("id") ON DELETE set null ON UPDATE no action,
	"kitchen_store_id" text,
	"status" text DEFAULT 'intent' NOT NULL,
	"intent_signed_at" timestamp with time zone,
	"selected_at" timestamp with time zone,
	"incorporated_at" timestamp with time zone,
	"lease_signed_at" timestamp with time zone,
	"renovation_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"fc_deposit_amount" numeric(12, 2),
	"drive_folder_id" uuid,
	"notes" text,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mlk_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL REFERENCES "public"."mlk_investors"("id") ON DELETE cascade ON UPDATE no action,
	"store_id" uuid REFERENCES "public"."mlk_stores"("id") ON DELETE cascade ON UPDATE no action,
	"kind" text NOT NULL,
	"amount_due" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"paid_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mlk_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL REFERENCES "public"."mlk_couples"("id") ON DELETE cascade ON UPDATE no action,
	"store_id" uuid REFERENCES "public"."mlk_stores"("id") ON DELETE set null ON UPDATE no action,
	"month" date NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"notes" text,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mlk_store_revenue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL REFERENCES "public"."mlk_stores"("id") ON DELETE cascade ON UPDATE no action,
	"date" date NOT NULL,
	"turnover" numeric(12, 2) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mlk_store_revenue_store_date_uq" ON "mlk_store_revenue" ("store_id", "date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mlk_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL REFERENCES "public"."mlk_stores"("id") ON DELETE cascade ON UPDATE no action,
	"month" date NOT NULL,
	"turnover" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_profit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"investor_payout" numeric(12, 2) DEFAULT '0' NOT NULL,
	"couple_payout" numeric(12, 2) DEFAULT '0' NOT NULL,
	"mgmt_payout" numeric(12, 2) DEFAULT '0' NOT NULL,
	"detail" jsonb,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mlk_settlements_store_month_uq" ON "mlk_settlements" ("store_id", "month");
