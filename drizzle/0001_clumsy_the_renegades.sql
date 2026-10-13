CREATE TABLE "emily_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emily_slug" text NOT NULL,
	"project" text NOT NULL,
	"summary" jsonb NOT NULL,
	"turns" integer NOT NULL,
	"locale" "locale" NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emilys" (
	"slug" text PRIMARY KEY NOT NULL,
	"draft" jsonb NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emily_results" ADD CONSTRAINT "emily_results_emily_slug_emilys_slug_fk" FOREIGN KEY ("emily_slug") REFERENCES "public"."emilys"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emily_results_slug_created_idx" ON "emily_results" USING btree ("emily_slug","created_at");--> statement-breakpoint
-- Supabase exposes "public" through its REST API with the publishable key. RLS without policies
-- blocks that API; the app connects as the table owner (DATABASE_URL), which RLS doesn't restrict.
ALTER TABLE "emilys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "emily_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interview_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interview_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interview_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transcript_turns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interview_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "integration_jobs" ENABLE ROW LEVEL SECURITY;
