CREATE TABLE "rent_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" numeric,
	"lng" numeric,
	"landlord_name" text,
	"lease_start" date,
	"lease_months" integer,
	"monthly_rent" numeric(12, 2),
	"deposit" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'SGD' NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rent_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"period" varchar(7),
	"doc_tag" text,
	"paid_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rent_files" ADD CONSTRAINT "rent_files_location_id_rent_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."rent_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_files" ADD CONSTRAINT "rent_files_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;