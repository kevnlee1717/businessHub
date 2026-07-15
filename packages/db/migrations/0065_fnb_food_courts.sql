CREATE TABLE "fnb_food_courts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stall" text,
	"brand" text,
	"notes" text,
	"rent_pct" numeric(8, 2),
	"min_rent" numeric(12, 2),
	"adv_pct" numeric(8, 2),
	"mdr_pct" numeric(8, 2),
	"fixed_fees" jsonb,
	"entrance_total" numeric(12, 2),
	"entrance_months" integer,
	"food_pct" numeric(8, 2) DEFAULT '35' NOT NULL,
	"gst_pct" numeric(8, 2) DEFAULT '9' NOT NULL,
	"include_gst" boolean DEFAULT true NOT NULL,
	"salary" numeric(12, 2) DEFAULT '8000' NOT NULL,
	"investor_floor" numeric(12, 2) DEFAULT '2800' NOT NULL,
	"profit_target" numeric(12, 2) DEFAULT '5600' NOT NULL,
	"tiers" jsonb DEFAULT '[25000,30000,35000]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fnb_food_courts" ADD CONSTRAINT "fnb_food_courts_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
