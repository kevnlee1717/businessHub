DO $$ BEGIN
 CREATE TYPE "service_category" AS ENUM('core_ep', 'banking_tax', 'family', 'gov_fee');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "case_service_source" AS ENUM('package', 'extra');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "case_service_status" AS ENUM('active', 'removed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "charge_kind" ADD VALUE IF NOT EXISTS 'service';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text NOT NULL,
	"category" "service_category" NOT NULL,
	"default_price_sgd" numeric(12, 2) NOT NULL,
	"is_core" boolean NOT NULL,
	"billable" boolean NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "service_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text NOT NULL,
	"base_price_sgd" numeric(12, 2) NOT NULL,
	"tagline" text,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "packages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "package_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL REFERENCES "packages"("id") ON DELETE cascade,
	"service_item_id" uuid NOT NULL REFERENCES "service_items"("id"),
	CONSTRAINT "package_items_package_service_unique" UNIQUE("package_id", "service_item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "package_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL REFERENCES "packages"("id") ON DELETE cascade,
	"seq" integer NOT NULL,
	"label" text NOT NULL,
	"label_en" text NOT NULL,
	"amount_sgd" numeric(12, 2) NOT NULL,
	"bind_step_order" integer,
	"refundable_note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE cascade,
	"service_item_id" uuid NOT NULL REFERENCES "service_items"("id"),
	"name_snapshot" text NOT NULL,
	"source" "case_service_source" NOT NULL,
	"is_billable" boolean NOT NULL,
	"price_sgd" numeric(12, 2),
	"charge_id" uuid REFERENCES "billing_charges"("id") ON DELETE set null,
	"status" "case_service_status" DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "package_id" uuid REFERENCES "packages"("id");
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.contype = 'f'
    AND c.conrelid = '"cases"'::regclass
    AND c.confrelid = '"packages"'::regclass
    AND a.attname = 'package_id'
 ) THEN
  ALTER TABLE "cases" ADD CONSTRAINT "cases_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "packages"("id");
 END IF;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
