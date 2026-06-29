ALTER TABLE "diploma_programs" ADD COLUMN "months" integer;--> statement-breakpoint
UPDATE "diploma_programs" p SET "months" = COALESCE((SELECT MAX(c."month_index") FROM "diploma_courses" c WHERE c."program_id" = p."id"), 12) WHERE p."months" IS NULL;
