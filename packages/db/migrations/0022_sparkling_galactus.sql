CREATE TABLE "llm_settings" (
	"installation_id" bigint PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_last4" text NOT NULL,
	"rejected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"repository" text NOT NULL,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"author_login" text NOT NULL,
	"branch" text NOT NULL,
	"reached_at" timestamp with time zone NOT NULL,
	CONSTRAINT "production_pull_requests_installation_id_repository_number_branch_unique" UNIQUE("installation_id","repository","number","branch")
);
--> statement-breakpoint
CREATE TABLE "production_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"team_name" text NOT NULL,
	"date" date NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_reports_installation_id_team_name_date_unique" UNIQUE("installation_id","team_name","date")
);
--> statement-breakpoint
CREATE TABLE "team_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"team_name" text NOT NULL,
	"enabled" boolean NOT NULL,
	"channel" text NOT NULL,
	"weekday" text NOT NULL,
	"time" text NOT NULL,
	"production_branch" text DEFAULT 'main' NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_reports_installation_id_team_name_unique" UNIQUE("installation_id","team_name")
);
--> statement-breakpoint
ALTER TABLE "llm_settings" ADD CONSTRAINT "llm_settings_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_pull_requests" ADD CONSTRAINT "production_pull_requests_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_reports" ADD CONSTRAINT "team_reports_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_pull_requests_window_idx" ON "production_pull_requests" USING btree ("installation_id","branch","reached_at");