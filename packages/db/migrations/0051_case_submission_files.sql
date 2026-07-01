ALTER TABLE "case_submissions" ADD COLUMN IF NOT EXISTS "screenshot_document_id" uuid;
ALTER TABLE "case_submissions" ADD COLUMN IF NOT EXISTS "appeal_document_id" uuid;
ALTER TABLE "case_submissions" ADD COLUMN IF NOT EXISTS "attachment_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
