ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "ifm_company_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_ifm_company_id_unique" ON "companies" ("ifm_company_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ifm_companies_cache" (
	"ifm_company_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recruitment_ifm_user_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ifm_user_id" text NOT NULL,
	"ifm_display_name" text,
	"employee_id" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"bridge_role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_ifm_user_bindings_bridge_role_check" CHECK ("bridge_role" IN ('manager', 'operator'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recruitment_ifm_user_bindings_ifm_user_id_unique" ON "recruitment_ifm_user_bindings" ("ifm_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recruitment_kpi_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	"assignee_employee_id" uuid NOT NULL REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action,
	"metric" text NOT NULL,
	"platform" varchar(120),
	"target_per_day" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"issued_by_source" text DEFAULT 'bh' NOT NULL,
	"issued_by_ifm_user" text,
	"issued_by_employee_id" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_kpi_targets_metric_check" CHECK ("metric" IN ('daily_posts', 'daily_new_group_owners', 'daily_contacts')),
	CONSTRAINT "recruitment_kpi_targets_issued_by_source_check" CHECK ("issued_by_source" IN ('ifm', 'bh'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recruitment_group_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	"platform" varchar(120) NOT NULL,
	"group_name" varchar(200) NOT NULL,
	"owner_name" varchar(200),
	"owner_contact" varchar(120),
	"group_url" varchar(1024),
	"member_count" integer,
	"found_by" uuid NOT NULL REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action,
	"found_on" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
