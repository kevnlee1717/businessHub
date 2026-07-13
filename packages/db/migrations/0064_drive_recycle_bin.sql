ALTER TABLE "drive_nodes" ADD COLUMN "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "drive_nodes" ADD COLUMN "deleted_batch" uuid;
--> statement-breakpoint
CREATE INDEX "drive_nodes_deleted_at_idx" ON "drive_nodes" USING btree ("deleted_at");
