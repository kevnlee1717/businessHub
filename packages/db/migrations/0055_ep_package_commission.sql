DO $$ BEGIN
 CREATE TYPE "commission_target" AS ENUM('internal_sales', 'external_channel');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "package_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL REFERENCES "packages"("id") ON DELETE cascade,
	"target" "commission_target" NOT NULL,
	"basis" "milestone_basis" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"default_party_id" uuid REFERENCES "deal_parties"("id") ON DELETE set null,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE cascade,
	"target" "commission_target" NOT NULL,
	"party_id" uuid REFERENCES "deal_parties"("id") ON DELETE set null,
	"external_party_id" uuid REFERENCES "external_parties"("id") ON DELETE set null,
	"basis" "milestone_basis" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
