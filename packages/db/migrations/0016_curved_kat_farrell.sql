CREATE TYPE "public"."commission_entry_status" AS ENUM('pending', 'settled', 'void');--> statement-breakpoint
CREATE TYPE "public"."commission_recurrence" AS ENUM('one_time', 'monthly');--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_id" uuid NOT NULL,
	"billing_id" uuid NOT NULL,
	"business_id" uuid,
	"period" text NOT NULL,
	"recurrence" "commission_recurrence" NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"amount_sgd" numeric(12, 2) NOT NULL,
	"status" "commission_entry_status" DEFAULT 'pending' NOT NULL,
	"payslip_id" uuid,
	"source_line_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_business_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"commission_type" "commission_type",
	"commission_value" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_business_assignments_sales_business_unique" UNIQUE("sales_id","business_id")
);
--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_sales_id_employees_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_business_assignments" ADD CONSTRAINT "sales_business_assignments_sales_id_employees_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_business_assignments" ADD CONSTRAINT "sales_business_assignments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;