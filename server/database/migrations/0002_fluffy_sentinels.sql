CREATE TABLE "wx_pay_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"out_trade_no" varchar(32) NOT NULL,
	"wx_user_id" integer NOT NULL,
	"openid" varchar(64) NOT NULL,
	"amount" integer NOT NULL,
	"description" varchar(127) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"transaction_id" varchar(64),
	"paid_at" timestamp with time zone,
	"callback_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wx_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wx_user_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wx_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openid" varchar(64) NOT NULL,
	"unionid" varchar(64),
	"session_key" varchar(64),
	"nickname" varchar(100),
	"avatar_url" varchar(500),
	"phone_number" varchar(30),
	"country_code" varchar(10),
	"user_id" integer,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wx_pay_orders" ADD CONSTRAINT "wx_pay_orders_wx_user_id_wx_users_id_fk" FOREIGN KEY ("wx_user_id") REFERENCES "public"."wx_users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "wx_sessions" ADD CONSTRAINT "wx_sessions_wx_user_id_wx_users_id_fk" FOREIGN KEY ("wx_user_id") REFERENCES "public"."wx_users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "wx_users" ADD CONSTRAINT "wx_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "wx_pay_orders_out_trade_no_idx" ON "wx_pay_orders" USING btree ("out_trade_no");--> statement-breakpoint
CREATE INDEX "wx_pay_orders_wx_user_idx" ON "wx_pay_orders" USING btree ("wx_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wx_sessions_token_hash_idx" ON "wx_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "wx_sessions_wx_user_idx" ON "wx_sessions" USING btree ("wx_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wx_users_openid_idx" ON "wx_users" USING btree ("openid");--> statement-breakpoint
CREATE INDEX "wx_users_unionid_idx" ON "wx_users" USING btree ("unionid");