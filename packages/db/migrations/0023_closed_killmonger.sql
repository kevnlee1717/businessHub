CREATE TYPE "public"."data_scope" AS ENUM('all', 'company', 'self');--> statement-breakpoint
CREATE TYPE "public"."permission_effect" AS ENUM('grant', 'revoke');--> statement-breakpoint
CREATE TABLE "employee_company_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_company_access_employee_company_unique" UNIQUE("employee_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "employee_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"permission" varchar(64) NOT NULL,
	"effect" "permission_effect" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_permission_overrides_employee_permission_unique" UNIQUE("employee_id","permission")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "data_scope" "data_scope" DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_company_access" ADD CONSTRAINT "employee_company_access_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_company_access" ADD CONSTRAINT "employee_company_access_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_permission_overrides" ADD CONSTRAINT "employee_permission_overrides_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;