CREATE TYPE "public"."franchise_contract_expiry" AS ENUM('none', 'within_3_months', 'within_6_months', 'within_1_year');--> statement-breakpoint
CREATE TYPE "public"."franchise_decision_maker" AS ENUM('can_decide', 'need_management', 'need_committee');--> statement-breakpoint
CREATE TYPE "public"."franchise_footfall" AS ENUM('very_high', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."franchise_interest_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."franchise_org_type" AS ENUM('fnb_group', 'property_company', 'owner', 'cafe_brand', 'other');--> statement-breakpoint
CREATE TYPE "public"."franchise_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."franchise_property_type" AS ENUM('mall', 'office', 'condo', 'hotel', 'industrial', 'airport', 'train_mrt', 'food_court', 'hospital_school', 'other');--> statement-breakpoint
CREATE TYPE "public"."franchise_service" AS ENUM('vending_machine', 'massage_chair', 'cleaning_robot', 'ai_mattress', 'security', 'cleaning');--> statement-breakpoint
CREATE TYPE "public"."franchise_site_status" AS ENUM('unvisited', 'following', 'won', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."franchise_tri_state" AS ENUM('yes', 'no', 'pending');--> statement-breakpoint
CREATE TABLE "franchise_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" varchar(120),
	"phone" varchar(64),
	"org_id" uuid,
	"referred_by_contact_id" uuid,
	"next_visit_at" timestamp with time zone,
	"owner_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_fnb_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"org_id" uuid,
	"location" text,
	"has_aircon" boolean,
	"introduced_by_contact_id" uuid,
	"relationship_note" text,
	"priority" "franchise_priority" NOT NULL,
	"status" "franchise_site_status" DEFAULT 'unvisited' NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_fnb_survey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"rent_fixed" numeric(12, 2),
	"rent_revenue_share_pct" numeric(6, 2),
	"management_fee" numeric(12, 2),
	"dishwash_fee" numeric(12, 2),
	"contract_expiry" "franchise_contract_expiry",
	"extra" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchise_fnb_survey_visit_unique" UNIQUE("visit_id")
);
--> statement-breakpoint
CREATE TABLE "franchise_fnb_visit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"contact_id" uuid,
	"by_employee_id" uuid NOT NULL,
	"visited_at" timestamp with time zone NOT NULL,
	"interest_level" "franchise_interest_level" NOT NULL,
	"result" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_org" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "franchise_org_type" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_property" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"property_type" "franchise_property_type" NOT NULL,
	"address" text,
	"org_id" uuid,
	"is_vending_site" boolean DEFAULT false NOT NULL,
	"vending_note" text,
	"introduced_by_contact_id" uuid,
	"relationship_note" text,
	"priority" "franchise_priority" NOT NULL,
	"footfall" "franchise_footfall",
	"decision_maker" "franchise_decision_maker",
	"has_public_space" "franchise_tri_state",
	"status" "franchise_site_status" DEFAULT 'unvisited' NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_property_survey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"interested_services" text[],
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchise_property_survey_visit_unique" UNIQUE("visit_id")
);
--> statement-breakpoint
CREATE TABLE "franchise_property_visit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"contact_id" uuid,
	"by_employee_id" uuid NOT NULL,
	"visited_at" timestamp with time zone NOT NULL,
	"interest_level" "franchise_interest_level" NOT NULL,
	"services_pitched" text[],
	"result" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "franchise_contact" ADD CONSTRAINT "franchise_contact_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_contact" ADD CONSTRAINT "franchise_contact_org_id_franchise_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."franchise_org"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_contact" ADD CONSTRAINT "franchise_contact_referred_by_contact_id_franchise_contact_id_fk" FOREIGN KEY ("referred_by_contact_id") REFERENCES "public"."franchise_contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_contact" ADD CONSTRAINT "franchise_contact_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_site" ADD CONSTRAINT "franchise_fnb_site_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_site" ADD CONSTRAINT "franchise_fnb_site_org_id_franchise_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."franchise_org"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_site" ADD CONSTRAINT "franchise_fnb_site_introduced_by_contact_id_franchise_contact_id_fk" FOREIGN KEY ("introduced_by_contact_id") REFERENCES "public"."franchise_contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_site" ADD CONSTRAINT "franchise_fnb_site_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_survey" ADD CONSTRAINT "franchise_fnb_survey_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_survey" ADD CONSTRAINT "franchise_fnb_survey_visit_id_franchise_fnb_visit_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."franchise_fnb_visit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_visit" ADD CONSTRAINT "franchise_fnb_visit_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_visit" ADD CONSTRAINT "franchise_fnb_visit_site_id_franchise_fnb_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."franchise_fnb_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_visit" ADD CONSTRAINT "franchise_fnb_visit_contact_id_franchise_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."franchise_contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_fnb_visit" ADD CONSTRAINT "franchise_fnb_visit_by_employee_id_employees_id_fk" FOREIGN KEY ("by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_org" ADD CONSTRAINT "franchise_org_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property" ADD CONSTRAINT "franchise_property_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property" ADD CONSTRAINT "franchise_property_org_id_franchise_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."franchise_org"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property" ADD CONSTRAINT "franchise_property_introduced_by_contact_id_franchise_contact_id_fk" FOREIGN KEY ("introduced_by_contact_id") REFERENCES "public"."franchise_contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property" ADD CONSTRAINT "franchise_property_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property_survey" ADD CONSTRAINT "franchise_property_survey_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property_survey" ADD CONSTRAINT "franchise_property_survey_visit_id_franchise_property_visit_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."franchise_property_visit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property_visit" ADD CONSTRAINT "franchise_property_visit_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property_visit" ADD CONSTRAINT "franchise_property_visit_property_id_franchise_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."franchise_property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property_visit" ADD CONSTRAINT "franchise_property_visit_contact_id_franchise_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."franchise_contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_property_visit" ADD CONSTRAINT "franchise_property_visit_by_employee_id_employees_id_fk" FOREIGN KEY ("by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;