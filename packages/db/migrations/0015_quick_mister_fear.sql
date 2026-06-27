CREATE TYPE "public"."charge_kind" AS ENUM('milestone', 'period', 'event');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('pending', 'partial', 'paid', 'waived');--> statement-breakpoint
CREATE TYPE "public"."milestone_basis" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TABLE "billing_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_id" uuid NOT NULL,
	"scheme_line_id" uuid,
	"charge_kind" charge_kind NOT NULL,
	"seq" integer NOT NULL,
	"label" text NOT NULL,
	"period" text,
	"due_date" date,
	"case_step_id" uuid,
	"amount_expected" numeric(12, 2) NOT NULL,
	"amount_collected" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" charge_status DEFAULT 'pending' NOT NULL,
	"currency" "currency" DEFAULT 'SGD' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheme_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"label" text NOT NULL,
	"basis" "milestone_basis" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"bind_step_order" integer,
	"due_offset_days" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheme_milestones_version_seq_unique" UNIQUE("version_id","seq")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "charge_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_scheme_line_id_scheme_lines_id_fk" FOREIGN KEY ("scheme_line_id") REFERENCES "public"."scheme_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_case_step_id_case_steps_id_fk" FOREIGN KEY ("case_step_id") REFERENCES "public"."case_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_milestones" ADD CONSTRAINT "scheme_milestones_version_id_scheme_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."scheme_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_billing_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."billing_charges"("id") ON DELETE set null ON UPDATE no action;