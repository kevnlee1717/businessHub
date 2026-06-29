ALTER TABLE "diploma_programs" ADD COLUMN "price_sgd" numeric(12, 2);--> statement-breakpoint
UPDATE "diploma_programs" p SET "price_sgd" = (SELECT SUM(c."price_sgd") FROM "diploma_courses" c WHERE c."program_id" = p."id") WHERE p."price_sgd" IS NULL;
