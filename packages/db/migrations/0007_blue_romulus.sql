CREATE TYPE "public"."case_submission_result" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
ALTER TYPE "public"."business_type" ADD VALUE 'dp';--> statement-breakpoint
ALTER TYPE "public"."case_step_status" ADD VALUE 'need_materials' BEFORE 'done';--> statement-breakpoint
CREATE TABLE "case_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"result" "case_submission_result" DEFAULT 'pending' NOT NULL,
	"rejected_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guarantors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nric" text,
	"gender" "gender",
	"age" integer,
	"id_card_document_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "parent_case_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "guarantor_id" uuid;--> statement-breakpoint
ALTER TABLE "case_steps" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "case_submissions" ADD CONSTRAINT "case_submissions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_id_card_document_id_documents_id_fk" FOREIGN KEY ("id_card_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_parent_case_id_cases_id_fk" FOREIGN KEY ("parent_case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_guarantor_id_guarantors_id_fk" FOREIGN KEY ("guarantor_id") REFERENCES "public"."guarantors"("id") ON DELETE set null ON UPDATE no action;