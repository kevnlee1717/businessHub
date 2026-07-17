ALTER TABLE "case_steps" ADD COLUMN IF NOT EXISTS "completed_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_step_date_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_step_id" uuid NOT NULL REFERENCES "public"."case_steps"("id") ON DELETE cascade ON UPDATE no action,
	"actor_id" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"action" text NOT NULL,
	"old_completed_at" timestamp with time zone,
	"new_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_step_date_logs_step_idx" ON "case_step_date_logs" ("case_step_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_resubmissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action,
	"round_no" integer NOT NULL,
	"required_note" text,
	"status" text DEFAULT 'awaiting' NOT NULL,
	"requested_at" date,
	"resubmitted_at" date,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_resubmissions_case_idx" ON "case_resubmissions" ("case_id");
