CREATE TABLE "course_design_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
