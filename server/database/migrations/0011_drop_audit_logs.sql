--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_users_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_logs_table_row_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_logs_user_created_idx";--> statement-breakpoint
DROP TABLE "audit_logs";