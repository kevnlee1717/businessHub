CREATE TYPE "public"."company_expense_type" AS ENUM('rent', 'utility', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."contract_subject_type" AS ENUM('case', 'enrollment', 'company', 'client');--> statement-breakpoint
CREATE TYPE "public"."contract_version_status" AS ENUM('draft', 'signed', 'superseded');--> statement-breakpoint
CREATE TABLE "company_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "company_expense_type" NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" "currency" DEFAULT 'SGD' NOT NULL,
	"period" text,
	"paid_at" timestamp with time zone,
	"note" text,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "contract_subject_type" NOT NULL,
	"subject_id" uuid,
	"title" text NOT NULL,
	"party_info" text,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"current_version_no" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"document_id" uuid,
	"status" "contract_version_status" DEFAULT 'draft' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_versions_contract_version_unique" UNIQUE("contract_id","version_no")
);
--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;