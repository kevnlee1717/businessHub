ALTER TABLE "franchise_fnb_site" ADD COLUMN "lat" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "franchise_fnb_site" ADD COLUMN "lng" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "franchise_fnb_site" ADD COLUMN "unit_floor" varchar(64);--> statement-breakpoint
ALTER TABLE "franchise_property" ADD COLUMN "lat" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "franchise_property" ADD COLUMN "lng" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "franchise_property" ADD COLUMN "unit_floor" varchar(64);