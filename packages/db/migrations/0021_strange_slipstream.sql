CREATE TABLE "google_chat_sign_in_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"chat_user_id" text NOT NULL,
	"chat_email" text,
	"installation_id" bigint NOT NULL,
	"space_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "google_chat_sign_in_tokens" ADD CONSTRAINT "google_chat_sign_in_tokens_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_chat_sign_in_tokens_user_idx" ON "google_chat_sign_in_tokens" USING btree ("installation_id","chat_user_id");