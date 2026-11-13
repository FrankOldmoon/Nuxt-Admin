-- Legacy files were served without authentication, so they are backfilled as
-- `public` to preserve existing behavior. New uploads default to `private`.
ALTER TABLE "files" ADD COLUMN "visibility" varchar(10) DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "visibility" SET DEFAULT 'private';--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
CREATE INDEX "files_organization_idx" ON "files" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "files_visibility_idx" ON "files" USING btree ("visibility");