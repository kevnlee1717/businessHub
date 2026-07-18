ALTER TABLE "mlk_couples" ADD COLUMN IF NOT EXISTS "ep_holder" text;
--> statement-breakpoint
ALTER TABLE "mlk_couples" ADD COLUMN IF NOT EXISTS "contract_signed_at" date;
--> statement-breakpoint
ALTER TABLE "mlk_couples" ADD COLUMN IF NOT EXISTS "deposit_paid_at" date;
--> statement-breakpoint
ALTER TABLE "mlk_couples" ADD COLUMN IF NOT EXISTS "deposit_amount" numeric(12, 2);
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'mlk_couples'
			AND column_name = 'husband_ep'
	) THEN
		EXECUTE $backfill$
			UPDATE "mlk_couples"
			SET "ep_holder" = 'husband'
			WHERE "ep_holder" IS NULL
				AND "husband_ep" = 'granted'
		$backfill$;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'mlk_couples'
			AND column_name = 'wife_ep'
	) THEN
		EXECUTE $backfill$
			UPDATE "mlk_couples"
			SET "ep_holder" = 'wife'
			WHERE "ep_holder" IS NULL
				AND "wife_ep" = 'granted'
		$backfill$;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "mlk_couples" DROP COLUMN IF EXISTS "husband_ep";
--> statement-breakpoint
ALTER TABLE "mlk_couples" DROP COLUMN IF EXISTS "wife_ep";
