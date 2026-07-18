CREATE TABLE IF NOT EXISTS "mlk_managers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"wechat" text,
	"id_no" text,
	"brand_name" text,
	"branding" text,
	"status" text DEFAULT 'candidate' NOT NULL,
	"joined_at" timestamp with time zone,
	"exited_at" timestamp with time zone,
	"mgmt_fee_rate" numeric(8, 2) DEFAULT '3' NOT NULL,
	"excess_bonus_rate" numeric(8, 2) DEFAULT '10' NOT NULL,
	"profit_threshold" numeric(12, 2) DEFAULT '5600' NOT NULL,
	"drive_folder_id" uuid,
	"notes" text,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mlk_cuisines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"manager_id" uuid REFERENCES "public"."mlk_managers"("id") ON DELETE set null ON UPDATE no action,
	"notes" text,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mlk_manager_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manager_id" uuid NOT NULL REFERENCES "public"."mlk_managers"("id") ON DELETE cascade ON UPDATE no action,
	"month" date NOT NULL,
	"mgmt_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"material_share" numeric(12, 2) DEFAULT '0' NOT NULL,
	"training_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"opening_surplus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"excess_bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"central_kitchen" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"detail" jsonb,
	"notes" text,
	"created_by" uuid REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mlk_manager_settlements_manager_month_uq" ON "mlk_manager_settlements" ("manager_id", "month");
--> statement-breakpoint
ALTER TABLE "mlk_stores" ADD COLUMN IF NOT EXISTS "cuisine_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'mlk_stores_cuisine_id_mlk_cuisines_id_fk'
	) THEN
		ALTER TABLE "mlk_stores"
			ADD CONSTRAINT "mlk_stores_cuisine_id_mlk_cuisines_id_fk"
			FOREIGN KEY ("cuisine_id") REFERENCES "public"."mlk_cuisines"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'mlk_stores'
			AND column_name = 'cuisine'
	) THEN
		EXECUTE $backfill$
			INSERT INTO "mlk_cuisines" ("name", "created_at", "updated_at")
			SELECT DISTINCT trim("cuisine"), now(), now()
			FROM "mlk_stores"
			WHERE "cuisine" IS NOT NULL
				AND trim("cuisine") <> ''
				AND NOT EXISTS (
					SELECT 1
					FROM "mlk_cuisines"
					WHERE "mlk_cuisines"."name" = trim("mlk_stores"."cuisine")
				)
		$backfill$;

		EXECUTE $update_stores$
			UPDATE "mlk_stores"
			SET "cuisine_id" = "mlk_cuisines"."id",
				"updated_at" = now()
			FROM "mlk_cuisines"
			WHERE "mlk_stores"."cuisine_id" IS NULL
				AND "mlk_stores"."cuisine" IS NOT NULL
				AND trim("mlk_stores"."cuisine") <> ''
				AND "mlk_cuisines"."name" = trim("mlk_stores"."cuisine")
		$update_stores$;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "mlk_stores" DROP COLUMN IF EXISTS "cuisine";
