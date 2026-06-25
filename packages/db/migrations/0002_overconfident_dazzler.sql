CREATE TYPE "public"."app_state" AS ENUM('foreground', 'background', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."face_challenge_status" AS ENUM('pending_push', 'pushed', 'passed', 'failed', 'timeout', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."face_purpose" AS ENUM('baseline_enroll', 'random_check', 'attendance', 'visit_checkin');--> statement-breakpoint
CREATE TYPE "public"."gps_trigger" AS ENUM('time', 'motion', 'manual');--> statement-breakpoint
CREATE TYPE "public"."site_visit_face_status" AS ENUM('pending', 'passed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."site_visit_status" AS ENUM('pending', 'verified', 'rejected_distance', 'rejected_face', 'manual_override');--> statement-breakpoint
CREATE TABLE "clock_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"radius_m" integer DEFAULT 200 NOT NULL,
	"company_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_clock_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"clock_point_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_clock_points_unique" UNIQUE("employee_id","clock_point_id")
);
--> statement-breakpoint
CREATE TABLE "face_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"photo_path" text NOT NULL,
	"embedding" "bytea",
	"embedding_model" text DEFAULT 'webface_r50' NOT NULL,
	"embedding_dim" integer,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "face_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"purpose" "face_purpose" NOT NULL,
	"status" "face_challenge_status" NOT NULL,
	"nonce" text,
	"similarity" numeric(6, 4),
	"liveness_action_passed" boolean,
	"liveness_color_score" numeric(6, 4),
	"baseline_id" uuid,
	"failure_reason" text,
	"related_attendance_id" uuid,
	"related_site_visit_id" uuid,
	"client_ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"accuracy" numeric(10, 2),
	"altitude" numeric(10, 2),
	"speed" numeric(10, 2),
	"heading" numeric(10, 2),
	"battery_level" integer,
	"is_moving" boolean,
	"trigger" "gps_trigger",
	"device_id" text,
	"app_state" "app_state",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"client_id" uuid,
	"captured_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"accuracy" numeric(10, 2),
	"address" text,
	"selfie_document_id" uuid,
	"site_photo_document_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"face_challenge_id" uuid,
	"face_status" "site_visit_face_status",
	"face_similarity" numeric(6, 4),
	"distance_to_lead_m" numeric(10, 2),
	"note" text,
	"status" "site_visit_status" DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"overridden_by" uuid,
	"overridden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "on_behalf_user_id" uuid;--> statement-breakpoint
ALTER TABLE "clock_points" ADD CONSTRAINT "clock_points_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_clock_points" ADD CONSTRAINT "employee_clock_points_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_clock_points" ADD CONSTRAINT "employee_clock_points_clock_point_id_clock_points_id_fk" FOREIGN KEY ("clock_point_id") REFERENCES "public"."clock_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_baselines" ADD CONSTRAINT "face_baselines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_challenges" ADD CONSTRAINT "face_challenges_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_challenges" ADD CONSTRAINT "face_challenges_baseline_id_face_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."face_baselines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_tracks" ADD CONSTRAINT "gps_tracks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_selfie_document_id_documents_id_fk" FOREIGN KEY ("selfie_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_overridden_by_employees_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "face_baselines_employee_active_unique" ON "face_baselines" USING btree ("employee_id") WHERE retired_at is null;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_on_behalf_user_id_employees_id_fk" FOREIGN KEY ("on_behalf_user_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;