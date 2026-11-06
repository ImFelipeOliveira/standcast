CREATE TABLE "google_chat_spaces" (
	"space_name" text PRIMARY KEY NOT NULL,
	"installation_id" bigint,
	"display_name" text NOT NULL,
	"link_code_hash" text,
	"link_code_expires_at" timestamp with time zone,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "google_chat_spaces" ADD CONSTRAINT "google_chat_spaces_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_chat_spaces_installation_idx" ON "google_chat_spaces" USING btree ("installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_chat_spaces_link_code_idx" ON "google_chat_spaces" USING btree ("link_code_hash");