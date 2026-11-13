CREATE TABLE "rate_limit_counters" (
	"bucket_key" varchar(255) PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_counters_updated_idx" ON "rate_limit_counters" USING btree ("updated_at");