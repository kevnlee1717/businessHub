CREATE TABLE "drive_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"storage_path" text,
	"mime" text,
	"size" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drive_nodes" ADD CONSTRAINT "drive_nodes_parent_id_drive_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."drive_nodes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "drive_nodes" ADD CONSTRAINT "drive_nodes_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "drive_nodes_parent_id_idx" ON "drive_nodes" USING btree ("parent_id");
