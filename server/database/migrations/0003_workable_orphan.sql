CREATE TABLE "stripe_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"out_trade_no" varchar(64) NOT NULL,
	"user_id" integer,
	"email" varchar(255),
	"amount" integer NOT NULL,
	"currency" varchar(10) NOT NULL,
	"description" varchar(255) NOT NULL,
	"session_id" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"transaction_id" varchar(255),
	"paid_at" timestamp with time zone,
	"callback_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_orders" ADD CONSTRAINT "stripe_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_orders_out_trade_no_idx" ON "stripe_orders" USING btree ("out_trade_no");--> statement-breakpoint
CREATE INDEX "stripe_orders_session_idx" ON "stripe_orders" USING btree ("session_id");