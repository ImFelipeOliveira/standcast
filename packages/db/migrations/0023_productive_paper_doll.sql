DROP INDEX "production_pull_requests_window_idx";--> statement-breakpoint
ALTER TABLE "production_pull_requests" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "production_pull_requests_window_idx" ON "production_pull_requests" USING btree ("installation_id","branch","recorded_at");