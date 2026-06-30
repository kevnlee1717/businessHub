CREATE TYPE "public"."ep_price_file_slot" AS ENUM('price_list', 'unit_price', 'faq');--> statement-breakpoint
CREATE TABLE "ep_price_files" (
	"slot" "ep_price_file_slot" NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ep_price_files_slot_unique" UNIQUE("slot")
);
--> statement-breakpoint
ALTER TABLE "ep_price_files" ADD CONSTRAINT "ep_price_files_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;