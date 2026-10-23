CREATE TABLE "membership_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_zh" varchar(100) NOT NULL,
	"description" varchar(255),
	"duration_days" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "membership_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"source" varchar(20) DEFAULT 'stripe' NOT NULL,
	"out_trade_no" varchar(64),
	"amount_cents" integer,
	"granted_by" integer,
	"note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_orders" ADD COLUMN "biz_type" varchar(20) DEFAULT 'generic' NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_orders" ADD COLUMN "biz_ref_id" integer;--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD CONSTRAINT "membership_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD CONSTRAINT "membership_subscriptions_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plans_slug_idx" ON "membership_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "membership_subscriptions_user_idx" ON "membership_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "membership_subscriptions_status_idx" ON "membership_subscriptions" USING btree ("status");