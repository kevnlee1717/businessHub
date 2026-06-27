CREATE TYPE "public"."business_status" AS ENUM('active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."scheme_line_basis" AS ENUM('fixed', 'percent_of_revenue', 'per_unit', 'margin');--> statement-breakpoint
CREATE TYPE "public"."scheme_line_kind" AS ENUM('revenue', 'cost', 'commission');--> statement-breakpoint
CREATE TYPE "public"."scheme_line_recurrence" AS ENUM('one_time', 'monthly', 'per_event');--> statement-breakpoint
CREATE TYPE "public"."scheme_version_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"category" text,
	"status" "business_status" DEFAULT 'active' NOT NULL,
	"default_version_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "deal_line_amounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_id" uuid NOT NULL,
	"scheme_line_id" uuid,
	"kind" "scheme_line_kind" NOT NULL,
	"recurrence" "scheme_line_recurrence" NOT NULL,
	"party_id" uuid,
	"label" text,
	"amount_per_period" numeric(12, 2),
	"periods_count" integer,
	"amount_total_expected" numeric(12, 2),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_parties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "scheme_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" "scheme_version_status" DEFAULT 'active' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"assumed_inputs" jsonb,
	"profit_rate" numeric(6, 3),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheme_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" "scheme_line_kind" NOT NULL,
	"basis" "scheme_line_basis" NOT NULL,
	"recurrence" "scheme_line_recurrence" NOT NULL,
	"party_id" uuid,
	"rate" numeric(12, 3),
	"unit_label" text,
	"input_key" text,
	"label" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "billing" ADD COLUMN "scheme_version_id" uuid;--> statement-breakpoint
ALTER TABLE "billing" ADD COLUMN "inputs" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_line_amounts" ADD CONSTRAINT "deal_line_amounts_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_line_amounts" ADD CONSTRAINT "deal_line_amounts_scheme_line_id_scheme_lines_id_fk" FOREIGN KEY ("scheme_line_id") REFERENCES "public"."scheme_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_line_amounts" ADD CONSTRAINT "deal_line_amounts_party_id_deal_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."deal_parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_versions" ADD CONSTRAINT "scheme_versions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_lines" ADD CONSTRAINT "scheme_lines_version_id_scheme_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."scheme_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_lines" ADD CONSTRAINT "scheme_lines_party_id_deal_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."deal_parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing" ADD CONSTRAINT "billing_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing" ADD CONSTRAINT "billing_scheme_version_id_scheme_versions_id_fk" FOREIGN KEY ("scheme_version_id") REFERENCES "public"."scheme_versions"("id") ON DELETE set null ON UPDATE no action;