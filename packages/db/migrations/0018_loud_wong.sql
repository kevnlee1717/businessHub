CREATE TABLE "collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"default_recurrence" "scheme_line_recurrence",
	"active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "case_steps" ADD COLUMN "collections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "template_steps" ADD COLUMN "collections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scheme_milestones" ADD COLUMN "collection_item_id" uuid;--> statement-breakpoint
ALTER TABLE "scheme_milestones" ADD CONSTRAINT "scheme_milestones_collection_item_id_collection_items_id_fk" FOREIGN KEY ("collection_item_id") REFERENCES "public"."collection_items"("id") ON DELETE set null ON UPDATE no action;