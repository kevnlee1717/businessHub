CREATE TABLE "diploma_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"label" text NOT NULL,
	"start_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD COLUMN "intake_id" uuid;--> statement-breakpoint
ALTER TABLE "diploma_intakes" ADD CONSTRAINT "diploma_intakes_course_id_diploma_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."diploma_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD CONSTRAINT "diploma_enrollments_intake_id_diploma_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."diploma_intakes"("id") ON DELETE set null ON UPDATE no action;