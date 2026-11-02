CREATE TABLE "blocker_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"blocker_id" text NOT NULL,
	"author_member_id" uuid NOT NULL,
	"text" text NOT NULL,
	"ref" jsonb,
	"opened_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_member_id" uuid,
	CONSTRAINT "blocker_states_installation_id_author_member_id_blocker_id_unique" UNIQUE("installation_id","author_member_id","blocker_id")
);
--> statement-breakpoint
ALTER TABLE "blocker_states" ADD CONSTRAINT "blocker_states_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocker_states" ADD CONSTRAINT "blocker_states_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocker_states" ADD CONSTRAINT "blocker_states_resolved_by_member_id_members_id_fk" FOREIGN KEY ("resolved_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;