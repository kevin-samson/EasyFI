CREATE TABLE "local_credentials" (
	"email" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_credentials_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "label" text DEFAULT 'Financial independence' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "inflation_rate" double precision;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "target_date" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "local_credentials" ENABLE ROW LEVEL SECURITY;
