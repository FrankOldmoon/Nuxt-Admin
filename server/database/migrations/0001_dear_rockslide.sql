CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" varchar(50),
	"table_name" varchar(100) NOT NULL,
	"action" varchar(20) NOT NULL,
	"row_id" varchar(50),
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "audit_logs_table_row_idx" ON "audit_logs" USING btree ("table_name","row_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
--> ------------------------------------------------------------------
--> 搜索性能：启用 pg_trgm 扩展，并为通用 CRUD 的 ilike '%term%' 搜索列
--> 建立 GIN trigram 索引。扩展与索引缺失不影响功能（仅回退到顺序扫描）。
--> ------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_username_trgm_idx" ON "users" USING gin (username gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_email_trgm_idx" ON "users" USING gin (email gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "roles_name_trgm_idx" ON "roles" USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "roles_description_trgm_idx" ON "roles" USING gin (description gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "files_filename_trgm_idx" ON "files" USING gin (filename gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "files_original_name_trgm_idx" ON "files" USING gin (original_name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "files_mime_type_trgm_idx" ON "files" USING gin (mime_type gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notifications_title_trgm_idx" ON "notifications" USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notifications_content_trgm_idx" ON "notifications" USING gin (content gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "templates_name_trgm_idx" ON "templates" USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "templates_description_trgm_idx" ON "templates" USING gin (description gin_trgm_ops);