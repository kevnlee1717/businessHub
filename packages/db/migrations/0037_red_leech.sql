CREATE TABLE "diploma_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ALTER COLUMN "program" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "diploma_intakes" ALTER COLUMN "course_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "diploma_courses" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "diploma_intakes" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "diploma_courses" ADD CONSTRAINT "diploma_courses_program_id_diploma_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."diploma_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD CONSTRAINT "diploma_enrollments_program_id_diploma_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."diploma_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_intakes" ADD CONSTRAINT "diploma_intakes_program_id_diploma_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."diploma_programs"("id") ON DELETE cascade ON UPDATE no action;