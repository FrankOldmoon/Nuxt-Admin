ALTER TABLE "wx_pay_orders" DROP CONSTRAINT "wx_pay_orders_wx_user_id_wx_users_id_fk";
--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wx_pay_orders" ALTER COLUMN "wx_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wx_pay_orders" ALTER COLUMN "openid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD COLUMN "wx_user_id" integer;--> statement-breakpoint
ALTER TABLE "wx_pay_orders" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "wx_pay_orders" ADD COLUMN "biz_type" varchar(20) DEFAULT 'generic' NOT NULL;--> statement-breakpoint
ALTER TABLE "wx_pay_orders" ADD COLUMN "biz_ref_id" integer;--> statement-breakpoint
ALTER TABLE "wx_pay_orders" ADD CONSTRAINT "wx_pay_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "wx_pay_orders" ADD CONSTRAINT "wx_pay_orders_wx_user_id_wx_users_id_fk" FOREIGN KEY ("wx_user_id") REFERENCES "public"."wx_users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "membership_subscriptions_wx_user_idx" ON "membership_subscriptions" USING btree ("wx_user_id");--> statement-breakpoint
CREATE INDEX "wx_pay_orders_user_idx" ON "wx_pay_orders" USING btree ("user_id");