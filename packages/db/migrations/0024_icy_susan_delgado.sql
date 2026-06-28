CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"text_zh" text,
	"text_en" text,
	"source_lang" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "translations_entity_field_uniq" ON "translations" USING btree ("entity_type","entity_id","field");--> statement-breakpoint
CREATE INDEX "translations_lookup_idx" ON "translations" USING btree ("entity_type","field");