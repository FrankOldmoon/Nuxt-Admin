ALTER TABLE "agent_drafts" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "agent_drafts_expires_idx" ON "agent_drafts" USING btree ("expires_at");