ALTER TABLE "members" ADD COLUMN "verified_emails" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "members_verified_emails_idx" ON "members" USING gin ("verified_emails");