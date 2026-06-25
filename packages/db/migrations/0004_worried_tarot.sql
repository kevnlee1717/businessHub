CREATE TABLE "diploma_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"program" text NOT NULL,
	"enroll_date" date,
	"billing_id" uuid,
	"installments_count" integer,
	"graduated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "english_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"present" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "english_attendance_enrollment_session_unique" UNIQUE("enrollment_id","session_date")
);
--> statement-breakpoint
CREATE TABLE "english_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid,
	"teacher_id" uuid,
	"schedule" text,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "english_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid,
	"level_id" uuid,
	"enroll_date" date,
	"billing_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "english_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"level" integer,
	"price_sgd" numeric(12, 2),
	"duration" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"phone" text,
	"email" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wsq_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"content" text,
	"start_date" date,
	"duration" text,
	"teacher_id" uuid,
	"price_sgd" numeric(12, 2),
	"min_students" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wsq_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"billing_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD CONSTRAINT "diploma_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diploma_enrollments" ADD CONSTRAINT "diploma_enrollments_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "english_attendance" ADD CONSTRAINT "english_attendance_enrollment_id_english_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."english_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "english_classes" ADD CONSTRAINT "english_classes_level_id_english_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."english_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "english_classes" ADD CONSTRAINT "english_classes_teacher_id_employees_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "english_enrollments" ADD CONSTRAINT "english_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "english_enrollments" ADD CONSTRAINT "english_enrollments_class_id_english_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."english_classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "english_enrollments" ADD CONSTRAINT "english_enrollments_level_id_english_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."english_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "english_enrollments" ADD CONSTRAINT "english_enrollments_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wsq_courses" ADD CONSTRAINT "wsq_courses_teacher_id_employees_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wsq_enrollments" ADD CONSTRAINT "wsq_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wsq_enrollments" ADD CONSTRAINT "wsq_enrollments_course_id_wsq_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."wsq_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wsq_enrollments" ADD CONSTRAINT "wsq_enrollments_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE set null ON UPDATE no action;