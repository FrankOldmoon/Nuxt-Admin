--> statement-breakpoint

-- Remove the departments feature and convert the former `products` demo table
-- into the `templates` showcase table (owns a user, gains media columns), and
-- add a `template_users` many-to-many pivot.
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_departments_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "products_category_idx";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_department_id_departments_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "users_department_idx";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "department_id";--> statement-breakpoint
ALTER TABLE "departments" DROP CONSTRAINT "departments_parent_id_departments_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "departments_code_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "departments";--> statement-breakpoint
ALTER TABLE "products" RENAME TO "templates";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN IF EXISTS "category_id";--> statement-breakpoint
DROP INDEX IF EXISTS "products_status_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "products_status_idx" RENAME TO "templates_status_idx";--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "cover_image" varchar(500);--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "doc_file" varchar(500);--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_status_idx" ON "templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_user_idx" ON "templates" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "template_users_pair_idx" ON "template_users" USING btree ("template_id","user_id");--> statement-breakpoint
ALTER TABLE "template_users" ADD CONSTRAINT "template_users_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "template_users" ADD CONSTRAINT "template_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;