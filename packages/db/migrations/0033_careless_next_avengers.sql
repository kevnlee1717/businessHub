CREATE TYPE "public"."franchise_visit_status" AS ENUM('planned', 'completed', 'cancelled');--> statement-breakpoint
ALTER TABLE "franchise_fnb_visit" ALTER COLUMN "visited_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_fnb_visit" ALTER COLUMN "interest_level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_property_visit" ALTER COLUMN "visited_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_property_visit" ALTER COLUMN "interest_level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_fnb_visit" ADD COLUMN "status" "franchise_visit_status" DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_fnb_visit" ADD COLUMN "planned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "franchise_property_visit" ADD COLUMN "status" "franchise_visit_status" DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_property_visit" ADD COLUMN "planned_at" timestamp with time zone;