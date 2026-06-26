CREATE TABLE "diploma_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"content" text,
	"teacher_id" uuid,
	"price_sgd" numeric(12, 2),
	"duration" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "diploma_courses" ADD CONSTRAINT "diploma_courses_teacher_id_employees_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD CONSTRAINT "diploma_enrollments_course_id_diploma_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."diploma_courses"("id") ON DELETE set null ON UPDATE no action;