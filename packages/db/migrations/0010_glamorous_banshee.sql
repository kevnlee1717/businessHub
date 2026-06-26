CREATE TYPE "public"."step_review_action" AS ENUM('request', 'comment', 'approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."step_review_status" AS ENUM('none', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "step_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_step_id" uuid NOT NULL,
	"author_id" uuid,
	"action" "step_review_action" NOT NULL,
	"content" text,
	"document_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_step_documents" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "case_step_documents" ADD COLUMN "document_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "case_steps" ADD COLUMN "reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "case_steps" ADD COLUMN "review_status" "step_review_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "step_reviews" ADD CONSTRAINT "step_reviews_case_step_id_case_steps_id_fk" FOREIGN KEY ("case_step_id") REFERENCES "public"."case_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_reviews" ADD CONSTRAINT "step_reviews_author_id_employees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_step_documents" ADD CONSTRAINT "case_step_documents_category_id_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_reviewer_id_employees_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;