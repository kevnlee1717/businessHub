CREATE TYPE "public"."billing_ref_type" AS ENUM('ep', 'ica', 'diploma', 'english', 'wsq');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('unpaid', 'partial', 'paid');--> statement-breakpoint
CREATE TYPE "public"."commission_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('SGD', 'RMB');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('deposit', 'final', 'installment');--> statement-breakpoint
CREATE TYPE "public"."payroll_scheme" AS ENUM('cpf', 'levy', 'china_fund', 'none');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin', 'accountant', 'clerk', 'sales', 'teacher', 'principal', 'photographer');--> statement-breakpoint
CREATE TABLE "billing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref_type" "billing_ref_type" NOT NULL,
	"ref_id" uuid NOT NULL,
	"total_price_sgd" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deposit_sgd" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "billing_status" DEFAULT 'unpaid' NOT NULL,
	"sales_id" uuid,
	"commission_type" "commission_type",
	"commission_value" numeric(12, 2),
	"commission_amount_sgd" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"name_en" varchar(255),
	"parent_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_path" text NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime" varchar(255) NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"client_id" uuid,
	"category_id" uuid,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"name_en" varchar(255),
	"email" varchar(320) NOT NULL,
	"phone" varchar(64),
	"password_hash" varchar(255) NOT NULL,
	"role" "role" NOT NULL,
	"company_id" uuid,
	"position_id" uuid,
	"employment_type" "employment_type" DEFAULT 'full_time' NOT NULL,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"join_date" date,
	"payroll_scheme" "payroll_scheme",
	"salary_currency" "currency" DEFAULT 'SGD' NOT NULL,
	"gps_tracking_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "price_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text NOT NULL,
	"new_value" text NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_id" uuid NOT NULL,
	"paid_currency" "currency" NOT NULL,
	"paid_amount" numeric(12, 2) NOT NULL,
	"fx_rate" numeric(12, 6),
	"sgd_equivalent" numeric(12, 2) NOT NULL,
	"type" "payment_type" NOT NULL,
	"recorded_by" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "billing" ADD CONSTRAINT "billing_sales_id_employees_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_parent_id_document_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."document_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_employees_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_changed_by_employees_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_billing_id_billing_id_fk" FOREIGN KEY ("billing_id") REFERENCES "public"."billing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_employees_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;