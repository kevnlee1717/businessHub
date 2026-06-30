CREATE TABLE IF NOT EXISTS "recruitment_platforms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "name" varchar(120) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recruitment_platforms_company_name_unique" UNIQUE("company_id", "name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recruitment_prompt_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "material_type" "recruitment_material_type" NOT NULL,
  "base_prompt" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recruitment_prompt_templates_company_type_unique" UNIQUE("company_id", "material_type")
);
--> statement-breakpoint
ALTER TABLE "recruitment_materials" ADD COLUMN IF NOT EXISTS "tune_prompt" text;
--> statement-breakpoint
INSERT INTO "recruitment_platforms" ("company_id", "name")
SELECT DISTINCT "company_id", "platform"
FROM "recruitment_postings"
WHERE "platform" IS NOT NULL AND "platform" <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "recruitment_platforms" ("company_id", "name")
SELECT DISTINCT m."company_id", p."name"
FROM "recruitment_materials" m
CROSS JOIN LATERAL unnest(m."platforms") AS p("name")
WHERE m."platforms" IS NOT NULL AND p."name" IS NOT NULL AND p."name" <> ''
ON CONFLICT ("company_id", "name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "recruitment_prompt_templates" ("company_id", "material_type", "base_prompt")
SELECT
  c."id",
  t."material_type",
  CASE
    WHEN t."material_type" = 'copy' THEN '你是新加坡本地招聘文案助手。请只输出可直接给招聘人员使用的中文文案，不要解释过程。'
    ELSE ''
  END
FROM "companies" c
CROSS JOIN (
  VALUES
    ('copy'::"recruitment_material_type"),
    ('image'::"recruitment_material_type"),
    ('flyer'::"recruitment_material_type"),
    ('stand'::"recruitment_material_type")
) AS t("material_type")
ON CONFLICT ("company_id", "material_type") DO NOTHING;
