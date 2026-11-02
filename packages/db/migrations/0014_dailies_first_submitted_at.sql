ALTER TABLE "dailies" ADD COLUMN "first_submitted_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
UPDATE "dailies" SET "first_submitted_at" = "submitted_at";--> statement-breakpoint
ALTER TABLE "dailies" ALTER COLUMN "first_submitted_at" SET NOT NULL;
