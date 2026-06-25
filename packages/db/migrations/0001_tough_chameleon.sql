CREATE TYPE "public"."attendance_day_status" AS ENUM('present', 'late', 'early_leave', 'late_and_early', 'incomplete', 'absent');--> statement-breakpoint
CREATE TYPE "public"."attendance_kind" AS ENUM('clock_in', 'clock_out');--> statement-breakpoint
CREATE TYPE "public"."payslip_status" AS ENUM('draft', 'paid');--> statement-breakpoint
CREATE TYPE "public"."statutory_type" AS ENUM('cpf', 'levy', 'china_fund');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'doing', 'done');--> statement-breakpoint
CREATE TABLE "attendance_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"clock_in_id" uuid,
	"clock_out_id" uuid,
	"status" "attendance_day_status",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_days_employee_date_unique" UNIQUE("employee_id","work_date")
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"kind" "attendance_kind" NOT NULL,
	"clocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_point_id" uuid,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"distance_m" numeric(10, 2),
	"in_geofence" boolean,
	"face_challenge_id" uuid,
	"face_pass" boolean,
	"face_similarity" numeric(6, 4),
	"deviation_minutes" integer,
	"reason" text,
	"method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_employee_date_kind_unique" UNIQUE("employee_id","work_date","kind")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"uen" text,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compensation_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"base_salary" numeric(12, 2),
	"salary_currency" "currency",
	"attendance_bonus" numeric(12, 2),
	"task_completion_bonus" numeric(12, 2),
	"task_satisfaction_bonus" numeric(12, 2),
	"kpi_bonus" numeric(12, 2),
	"default_commission_type" "commission_type",
	"default_commission_value" numeric(12, 2),
	"payday" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensation_templates_company_position_unique" UNIQUE("company_id","position_id")
);
--> statement-breakpoint
CREATE TABLE "employee_compensation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"base_salary" numeric(12, 2),
	"salary_currency" "currency",
	"attendance_bonus" numeric(12, 2),
	"task_completion_bonus" numeric(12, 2),
	"task_satisfaction_bonus" numeric(12, 2),
	"kpi_bonus" numeric(12, 2),
	"default_commission_type" "commission_type",
	"default_commission_value" numeric(12, 2),
	"payday" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_compensation_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"allowed_late_count" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"period" text NOT NULL,
	"metric" text NOT NULL,
	"target" numeric(12, 2) NOT NULL,
	"actual" numeric(12, 2),
	"achievement_pct" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_targets_employee_period_metric_unique" UNIQUE("employee_id","period","metric")
);
--> statement-breakpoint
CREATE TABLE "performance_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"period" text NOT NULL,
	"attendance_qualified_auto" boolean,
	"attendance_qualified_override" boolean,
	"task_completion_pct_auto" numeric(6, 2),
	"task_completion_pct_override" numeric(6, 2),
	"task_satisfaction_pct_auto" numeric(6, 2),
	"task_satisfaction_pct_override" numeric(6, 2),
	"kpi_pct_auto" numeric(6, 2),
	"kpi_pct_override" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_scores_employee_period_unique" UNIQUE("employee_id","period")
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cpf_rates" jsonb,
	"levy_amount" numeric(12, 2),
	"china_fund_rate" numeric(6, 2),
	"attendance_allowed_late" integer DEFAULT 0 NOT NULL,
	"kpi_cap_100" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"period" text NOT NULL,
	"payday" integer,
	"base_salary" numeric(12, 2) DEFAULT '0' NOT NULL,
	"attendance_bonus_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"task_completion_bonus_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"task_satisfaction_bonus_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"kpi_bonus_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"commission_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gross" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cpf_employee" numeric(12, 2),
	"cpf_employer" numeric(12, 2),
	"levy" numeric(12, 2),
	"china_fund" numeric(12, 2),
	"other_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_pay" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" "currency" DEFAULT 'SGD' NOT NULL,
	"status" "payslip_status" DEFAULT 'draft' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payslips_employee_period_unique" UNIQUE("employee_id","period")
);
--> statement-breakpoint
CREATE TABLE "statutory_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "statutory_type" NOT NULL,
	"period" text NOT NULL,
	"employee_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"paid_at" timestamp with time zone,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"creator_id" uuid,
	"due_date" date,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"completed_at" timestamp with time zone,
	"on_time" boolean,
	"satisfaction_rating" integer,
	"rated_by" uuid,
	"rated_at" timestamp with time zone,
	"ref_type" text,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_clock_in_id_attendance_records_id_fk" FOREIGN KEY ("clock_in_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_clock_out_id_attendance_records_id_fk" FOREIGN KEY ("clock_out_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_templates" ADD CONSTRAINT "compensation_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_templates" ADD CONSTRAINT "compensation_templates_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_compensation" ADD CONSTRAINT "employee_compensation_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_paid_by_employees_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_payments" ADD CONSTRAINT "statutory_payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_employees_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_employees_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_rated_by_employees_id_fk" FOREIGN KEY ("rated_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_shift_id_work_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."work_shifts"("id") ON DELETE set null ON UPDATE no action;