CREATE TABLE "external_commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payee_id" uuid NOT NULL,
	"billing_id" uuid NOT NULL,
	"business_id" uuid,
	"party_id" uuid,
	"period" text NOT NULL,
	"recurrence" "commission_recurrence" NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"amount_sgd" numeric(12, 2) NOT NULL,
	"status" "commission_entry_status" DEFAULT 'pending' NOT NULL,
	"ledger_entry_id" uuid,
	"source_line_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid,
	"name" text NOT NULL,
	"name_en" text,
	"contact" text,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"statement_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_parties_statement_token_unique" UNIQUE("statement_token")
);
--> statement-breakpoint
ALTER TABLE "billing" ADD COLUMN "external_payees" jsonb;--> statement-breakpoint
ALTER TABLE "external_commission_entries" ADD CONSTRAINT "external_commission_entries_payee_id_external_parties_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."external_parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_commission_entries" ADD CONSTRAINT "external_commission_entries_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_commission_entries" ADD CONSTRAINT "external_commission_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_commission_entries" ADD CONSTRAINT "external_commission_entries_party_id_deal_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."deal_parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_commission_entries" ADD CONSTRAINT "external_commission_entries_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_parties" ADD CONSTRAINT "external_parties_party_id_deal_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."deal_parties"("id") ON DELETE set null ON UPDATE no action;