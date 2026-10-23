CREATE TABLE "alipay_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"out_trade_no" varchar(64) NOT NULL,
	"user_id" integer,
	"trade_no" varchar(64),
	"amount" integer NOT NULL,
	"description" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"biz_type" varchar(20) DEFAULT 'generic' NOT NULL,
	"biz_ref_id" integer,
	"paid_at" timestamp with time zone,
	"callback_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alipay_orders" ADD CONSTRAINT "alipay_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "alipay_orders_out_trade_no_idx" ON "alipay_orders" USING btree ("out_trade_no");--> statement-breakpoint
CREATE INDEX "alipay_orders_trade_no_idx" ON "alipay_orders" USING btree ("trade_no");--> statement-breakpoint
CREATE INDEX "alipay_orders_user_idx" ON "alipay_orders" USING btree ("user_id");