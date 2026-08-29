ALTER TABLE "users" DROP CONSTRAINT "users_position_id_positions_id_fk";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "position_id";--> statement-breakpoint
ALTER TABLE "positions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "positions" CASCADE;