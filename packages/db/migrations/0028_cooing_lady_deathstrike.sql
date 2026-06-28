ALTER TABLE "recruitment_materials" ADD COLUMN "platforms" text[];--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD COLUMN "share_url" varchar(1024);--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD COLUMN "screenshot_document_id" uuid;--> statement-breakpoint
ALTER TABLE "recruitment_postings" ADD CONSTRAINT "recruitment_postings_screenshot_document_id_documents_id_fk" FOREIGN KEY ("screenshot_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;