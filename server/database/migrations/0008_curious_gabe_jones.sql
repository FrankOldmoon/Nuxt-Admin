CREATE TABLE "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"kind" varchar(20) DEFAULT 'grant' NOT NULL,
	"feature" varchar(80) DEFAULT '' NOT NULL,
	"note" varchar(255) DEFAULT '' NOT NULL,
	"ref_id" integer,
	"operator_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "credit_transactions_user_created_idx" ON "credit_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_transactions_feature_idx" ON "credit_transactions" USING btree ("feature");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_ref_idx" ON "credit_transactions" USING btree ("ref_id");