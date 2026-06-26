CREATE TYPE "public"."diploma_assignment_action" AS ENUM('submit', 'comment', 'approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."diploma_assignment_status" AS ENUM('pending', 'submitted', 'passed', 'rejected');--> statement-breakpoint
CREATE TABLE "diploma_assignment_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"author_id" uuid,
	"action" "diploma_assignment_action" NOT NULL,
	"content" text,
	"document_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diploma_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"course_id" uuid,
	"status" "diploma_assignment_status" DEFAULT 'pending' NOT NULL,
	"passed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diploma_assignments_enrollment_course_unique" UNIQUE("enrollment_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "diploma_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount" numeric(12, 2),
	"paid" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diploma_payments_enrollment_period_unique" UNIQUE("enrollment_id","period")
);
--> statement-breakpoint
ALTER TABLE "diploma_courses" ADD COLUMN "month_index" integer;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD COLUMN "start_period" text;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD COLUMN "deposit_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD COLUMN "deposit_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD COLUMN "certificate_document_id" uuid;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD COLUMN "media_document_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "diploma_assignment_messages" ADD CONSTRAINT "diploma_assignment_messages_assignment_id_diploma_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."diploma_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_assignment_messages" ADD CONSTRAINT "diploma_assignment_messages_author_id_employees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_assignments" ADD CONSTRAINT "diploma_assignments_enrollment_id_diploma_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."diploma_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_assignments" ADD CONSTRAINT "diploma_assignments_course_id_diploma_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."diploma_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_payments" ADD CONSTRAINT "diploma_payments_enrollment_id_diploma_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."diploma_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD CONSTRAINT "diploma_enrollments_certificate_document_id_documents_id_fk" FOREIGN KEY ("certificate_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;