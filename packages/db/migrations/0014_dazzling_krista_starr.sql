CREATE TABLE "recurring_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"expense_category_id" uuid,
	"label" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "currency" DEFAULT 'SGD' NOT NULL,
	"due_day" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_costs_due_day_check" CHECK ("recurring_costs"."due_day" between 1 and 28)
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "opening_balance" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "opening_date" date;--> statement-breakpoint
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_expense_category_id_expense_categories_id_fk" FOREIGN KEY ("expense_category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;